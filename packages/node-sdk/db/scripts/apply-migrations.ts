import { getConnection } from "../src/pg-connection.ts";
import { migrations } from "../migrations/up.ts";
import type { Client } from "pg";

export async function applyMigrations(db: Client) {
  let migrationData = "";
  try {
    Deno.statSync(__dirname + "/migrations/up.sql");
    migrationData = Deno.readTextFileSync(__dirname + "/migrations/up.sql");
  } catch (e) {
    migrationData = migrations;
  }

  await db.query("CREATE EXTENSION IF NOT EXISTS pg_ivm;");
  await db.query(migrationData);

  /**
   * This is to generate the user/custom pgtyped files in compilation time
   * MIGRATIONS environment variable is used to specify the path to the migrations folder.
   * Every file in the migrations folder is executed in order.
   * TODO: Implement how to manage the order of the migrations, e.g. 1.sql, 2.sql, 10.sql, etc.
   */

  const userMigrations = Deno.env.get("MIGRATIONS");
  if (userMigrations) {
    const files = Deno.readDirSync(userMigrations);
    for (const file of files) {
      if (file.isFile && file.name.endsWith(".sql")) {
        console.log(`Executing migration: ${file.name}`);
        const migration = Deno.readTextFileSync(
          `${userMigrations}/${file.name}`,
        );
        await db.query(migration);
      }
    }
  }
}

if (import.meta.main) {
  const db = await getConnection();
  await applyMigrations(db);
}
