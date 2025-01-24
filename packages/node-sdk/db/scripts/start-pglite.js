#!/usr/bin/env node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import net from "node:net";
import { fromNodeSocket } from "pg-gateway/node";

// TODO: we hardcode the migration file here
//       but probably have to be smarter about this
//       like accepting a file path and running all migrations according to some logic
//       (ex: see `loadDataMigrations`)
//       trick: paima-engine needs to follow the same folder structure for migrations as Paima apps
const migration = readFileSync("./migrations/up.sql", "utf-8");
const db = new PGlite(undefined, {
  username: "postgres",
  database: "postgres",
});

await db.exec(migration);

{
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
