#!/usr/bin/env node
import { PGlite } from "@electric-sql/pglite";
// TODO This is not working, so we load the pg_ivm extension from the node_modules folder
// import { pg_ivm } from "@electric-sql/pglite/pg_ivm";
import { readFileSync } from "node:fs";
import net from "node:net";
import { fromNodeSocket } from "pg-gateway/node";
import { ENV } from "@paima/utils";

// TODO: we hardcode the migration file here
//       but probably have to be smarter about this
//       like accepting a file path and running all migrations according to some logic
//       (ex: see `loadDataMigrations`)
//       trick: paima-engine needs to follow the same folder structure for migrations as Paima apps
const migration = readFileSync("./migrations/up.sql", "utf-8");
const db = new PGlite(
  "memory://", // TODO: use different values for in-browser & production builds
  {
    username: "postgres",
    database: "postgres",
    extensions: {
      pg_ivm: new URL(
        "../../../../node_modules/@electric-sql/pglite/dist/pg_ivm.tar.gz",
        import.meta.url,
      ),
    },
    debug: ENV.DEBUG_PGLITE,
  },
);
await db.exec("CREATE EXTENSION IF NOT EXISTS pg_ivm;");

await db.exec(migration);

/**
 * This is to genereate the user/custom pgtyped files in compilation time
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
      const migration = readFileSync(`${userMigrations}/${file.name}`, "utf-8");
      await db.exec(migration);
    }
  }
}

{
  // TODO: consider switching to pglite-socket once it works
  //       https://discord.com/channels/933657521581858818/1371976702674075780/1371992712076595250
  const server = net.createServer(async (socket) => {
    await fromNodeSocket(socket, {
      serverVersion: "16.3",

      auth: {
        // No password required
        method: "trust",
      },

      async onStartup() {
        // Wait for PGlite to be ready before further processing
        await db.waitReady;
      },

      // Hook into each client message
      async onMessage(data, { isAuthenticated }) {
        // Only forward messages to PGlite after authentication
        if (!isAuthenticated) {
          return;
        }

        // Forward raw message to PGlite and send response to client
        return await db.execProtocolRaw(data);
      },
    });
  });

  server.listen(5432, () => {
    console.info("database: server listening on port 5432");
  });
}
