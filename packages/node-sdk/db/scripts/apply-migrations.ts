import { getConnection } from "../src/pg-connection.ts";
import { getMigrations } from "../migrations/system-version.ts";
import type { Client } from "pg";
import { insertPaimaEngineMigration } from "@paima/db";

export async function applyMigrations(
  db: Client,
  blockHeight: number,
  name: string,
  sql: string,
  isSystemMigration: boolean,
) {
  console.log(
    `[APPLY MIGRATION] Block height: ${blockHeight} | Migration: ${name}`,
  );
  await db.query(sql);
  await insertPaimaEngineMigration.run(
    {
      name,
      blockHeight,
      isSystemMigration,
    },
    db,
  );
}

// Functions for standalone execution
async function standAloneApplyInitialMigrations(
  db: Client,
  blockHeight: number,
) {
  const migrations = await getMigrations();
  for (const migration of migrations) {
    await applyMigrations(
      db,
      blockHeight,
      migration.version,
      migration.sql,
      true,
    );
  }
}

if (import.meta.main) {
  const db = await getConnection();
  await standAloneApplyInitialMigrations(db, 0);
  console.log("✅ System migrations applied");
  Deno.exit(0);
}
