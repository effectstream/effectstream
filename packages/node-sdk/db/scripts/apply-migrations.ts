import { getConnection } from "../src/pg-connection.ts";
import { getMigrations } from "../migrations/system-version.ts";
import type { Client } from "pg";
import { insertPaimaEngineMigration } from "@paima/db";

export async function applyInitialMigrations(db: Client, blockHeight: number) {
  const migrations = await getMigrations();
  for (const migration of migrations) {
    console.log(
      `Applying system migration: ${migration.version.join(".")}\n`,
      migration.sql,
    );
    await applyMigrations(
      db,
      blockHeight,
      migration.version.join("."),
      migration.sql,
      true,
    );
  }
}

export async function applyMigrations(
  db: Client,
  blockHeight: number,
  name: string,
  sql: string,
  isSystemMigration: boolean,
) {
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

export async function applyUserMigrations(db: Client, blockHeight: number) {
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
        console.log(`Applying user migration: ${file.name}`);
        const migration = Deno.readTextFileSync(
          `${userMigrations}/${file.name}`,
        );
        await db.query(migration);

        await insertPaimaEngineMigration.run(
          {
            name: file.name,
            blockHeight,
            isSystemMigration: false,
          },
          db,
        );
      }
    }
  }
}

if (import.meta.main) {
  const db = await getConnection();
  await applyInitialMigrations(db, 0);
  await applyUserMigrations(db, 0);
  console.log("Migrations applied");
  Deno.exit(0);
}
