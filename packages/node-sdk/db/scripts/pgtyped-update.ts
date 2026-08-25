#!/usr/bin/env bun
/**
 * Starts PGLite, applies system + user migrations, runs pgtyped codegen.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

import pg from "pg";
import { startPglite, type PgliteHandle } from "./start-pglite.ts";
import { waitForDb } from "./wait-for-db.ts";
import { applyMigrations } from "./apply-migrations.ts";
import { getConnection } from "../src/pg-connection.ts";
import { getMigrations } from "../migrations/system-version.ts";

function createPrefix(name: string): string {
  const colors: Record<string, string> = {
    "db:up": "\x1b[36m",
    "user-migrations": "\x1b[35m",
    "pgtyped": "\x1b[33m",
  };
  const reset = "\x1b[0m";
  const color = colors[name] || "\x1b[37m";
  return `${color}[${name}]${reset} `;
}

export interface UserMigration {
  name: string;
  sql: string;
}

export interface PgtypedUpdateOptions {
  userMigrations?: UserMigration[];
  pgtypedConfigPath?: string;
  pgtypedBin?: string;
  pgtypedTimeoutMs?: number;
}

async function preparePgtypedConfig(
  configPath: string,
  port: number,
): Promise<{ cleanup: () => Promise<void>; path: string }> {
  const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Pgtyped config must be a JSON object.");
  }

  const config = parsed as Record<string, unknown>;
  if (config.db !== undefined && (
    !config.db || typeof config.db !== "object" || Array.isArray(config.db)
  )) {
    throw new Error("Pgtyped config db field must be an object.");
  }
  const { dbUrl: _ignoredDbUrl, ...configWithoutUri } = config;
  const directory = await mkdtemp(join(tmpdir(), "effectstream-pgtyped-"));
  const derivedPath = join(directory, "pgtypedconfig.json");
  try {
    await writeFile(derivedPath, JSON.stringify({
      ...configWithoutUri,
      db: {
        ...(config.db as Record<string, unknown> | undefined),
        dbName: "postgres",
        host: "127.0.0.1",
        port,
        user: "postgres",
      },
    }));
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }

  return {
    path: derivedPath,
    cleanup: () => rm(directory, { force: true, recursive: true }),
  };
}

async function resolveUserMigrations(): Promise<UserMigration[]> {
  const candidates = [
    resolve(process.cwd(), "migration-order.ts"),
    resolve(process.cwd(), "src/migration-order.ts"),
  ];

  const migrationFile = candidates.find((p) => existsSync(p));
  if (!migrationFile) return [];

  const mod = await import(migrationFile);
  return mod.migrationTable ?? [];
}

async function applyUserMigrations(migrations: UserMigration[], port: number): Promise<void> {
  const prefix = createPrefix("user-migrations");

  if (migrations.length === 0) {
    console.log(`${prefix}No user migrations to apply, skipping`);
    return;
  }

  const client = new pg.Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    database: "postgres",
  });

  try {
    await client.connect();
    for (const migration of migrations) {
      console.log(`${prefix}Applying ${migration.name}`);
      await client.query(migration.sql);
    }
    console.log(`${prefix}✅ Applied ${migrations.length} user migration(s)`);
  } finally {
    await client.end();
  }
}

async function applySystemMigrations(port: number): Promise<void> {
  const prefix = createPrefix("apply-migrations");
  const db = getConnection({
    host: "127.0.0.1",
    port,
    user: "postgres",
    database: "postgres",
    max: 1,
  });
  try {
    const migrations = await getMigrations();
    for (const migration of migrations) {
      await applyMigrations(db as any, 0, migration.version, migration.sql, true);
    }
    console.log(`${prefix}✅ System migrations applied`);
  } finally {
    await db.end();
  }
}

async function runPgtyped(
  pgtypedBin: string,
  pgtypedConfigPath: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const prefix = createPrefix("pgtyped");
  console.log(`${prefix}Starting...`);

  const preparedConfig = await preparePgtypedConfig(pgtypedConfigPath, port);
  try {
    await new Promise<void>((resolve, reject) => {
      const childEnv = {
        ...process.env,
        PGDATABASE: "postgres",
        PGHOST: "127.0.0.1",
        PGPORT: String(port),
        PGUSER: "postgres",
      };
      delete childEnv.DATABASE_URL;
      delete childEnv.PGURI;

      const child = spawn("node", [
        pgtypedBin,
        "-c",
        preparedConfig.path,
      ], {
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });

      child.stdout?.on("data", (chunk: Buffer | string) => {
        chunk.toString().split("\n").forEach((line) => {
          if (line.trim()) console.log(`${prefix}${line}`);
        });
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        chunk.toString().split("\n").forEach((line) => {
          if (line.trim()) console.error(`${prefix}${line}`);
        });
      });

      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      }, timeoutMs);
      const settle = (operation: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        operation();
      };

      child.once("error", (error) => settle(() => reject(error)));
      child.once("close", (code) => settle(() => {
        if (timedOut) {
          reject(new Error(`pgtyped timed out after ${timeoutMs}ms`));
        } else if (code === 0) {
          console.log(`${prefix}✅ Completed successfully`);
          resolve();
        } else {
          reject(new Error(`pgtyped failed with exit code ${code}`));
        }
      }));
    });
  } finally {
    await preparedConfig.cleanup();
  }
}

export async function main(options?: PgtypedUpdateOptions) {
  const userMigrations = options?.userMigrations ?? await resolveUserMigrations();
  const pgtypedConfigPath = options?.pgtypedConfigPath ?? "./pgtypedconfig.json";
  const pgtypedBin = options?.pgtypedBin ?? resolve(process.cwd(), "node_modules/@paima/pgtyped-cli/lib/index.js");
  const pgtypedTimeoutMs = options?.pgtypedTimeoutMs ?? 600_000;

  console.log("🚀 Starting pgtyped-update...\n");

  let pglite: PgliteHandle | undefined;
  try {
    pglite = await startPglite(0);
    await waitForDb(pglite.port, "127.0.0.1");
    await applySystemMigrations(pglite.port);
    await applyUserMigrations(userMigrations, pglite.port);
    await runPgtyped(pgtypedBin, pgtypedConfigPath, pglite.port, pgtypedTimeoutMs);
    console.log("\n✅ All steps completed successfully");
  } finally {
    await pglite?.close({ force: true });
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error("\n❌ One or more steps failed:", error);
    process.exit(1);
  }
}
