#!/usr/bin/env bun
/**
 * Starts PGLite, applies system + user migrations, runs pgtyped codegen.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
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

async function applyUserMigrations(migrations: UserMigration[]): Promise<void> {
  const prefix = createPrefix("user-migrations");

  if (migrations.length === 0) {
    console.log(`${prefix}No user migrations to apply, skipping`);
    return;
  }

  const client = new pg.Client({
    host: "localhost",
    port: 5432,
    user: "postgres",
    database: "postgres",
  });
  await client.connect();

  try {
    for (const migration of migrations) {
      console.log(`${prefix}Applying ${migration.name}`);
      await client.query(migration.sql);
    }
    console.log(`${prefix}✅ Applied ${migrations.length} user migration(s)`);
  } finally {
    await client.end();
  }
}

async function applySystemMigrations(): Promise<void> {
  const prefix = createPrefix("apply-migrations");
  const db = getConnection();
  const migrations = await getMigrations();
  for (const migration of migrations) {
    await applyMigrations(db as any, 0, migration.version, migration.sql, true);
  }
  console.log(`${prefix}✅ System migrations applied`);
  await db.end();
}

async function runPgtyped(pgtypedBin: string, pgtypedConfigPath: string): Promise<void> {
  const prefix = createPrefix("pgtyped");
  console.log(`${prefix}Starting...`);

  return new Promise((resolve, reject) => {
    const child = spawn("node", [pgtypedBin, "-c", pgtypedConfigPath], {
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

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`${prefix}✅ Completed successfully`);
        resolve();
      } else {
        reject(new Error(`pgtyped failed with exit code ${code}`));
      }
    });
  });
}

export async function main(options?: PgtypedUpdateOptions) {
  const userMigrations = options?.userMigrations ?? await resolveUserMigrations();
  const pgtypedConfigPath = options?.pgtypedConfigPath ?? "./pgtypedconfig.json";
  const pgtypedBin = options?.pgtypedBin ?? resolve(process.cwd(), "node_modules/@paima/pgtyped-cli/lib/index.js");

  console.log("🚀 Starting pgtyped-update...\n");

  let pglite: PgliteHandle | undefined;
  try {
    pglite = await startPglite();
    await waitForDb();
    await applySystemMigrations();
    await applyUserMigrations(userMigrations);
    await runPgtyped(pgtypedBin, pgtypedConfigPath);
    console.log("\n✅ All steps completed successfully");
  } finally {
    await pglite?.close();
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
