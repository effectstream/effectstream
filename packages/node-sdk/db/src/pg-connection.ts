import type { Client, PoolClient, PoolConfig } from "pg";
import pg from "pg";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { type Operation, run, sleep } from "npm:effection@3.5.0";
import { ENV } from "@paima/utils";

let readonlyDBConn: pg.Pool | null;

// PGLite does not support multiple connections, so we need to use a mutex to ensure that only one query is executed at a time.
// * For transactions use yield* aquireDBMutex(); ...Your Operations... releaseDBMutex();
// * For single queries use await runPreparedQuery(myQuery.run(params, dbConn));
// IMPORTANT: This is only for PGLite instances, for full pgsql servers, this is not needed.
const IS_PGLITE = true; // TODO: make this configurable

// TODO This is a very simple mutex implementation.
//      It releases the mutex randomly, and not in order.
//      It only works for deno's single-threaded runtime.
//      pglite exports async-mutex, so we can use that for a proper solution.
let db_mutex: "free" | "locked" = "free";
export function* aquireDBMutex(): Operation<void> {
  if (!IS_PGLITE) return;
  while (true) {
    if (db_mutex === "free") {
      db_mutex = "locked";
      break;
    }
    yield* sleep(10);
  }
}

export function releaseDBMutex() {
  db_mutex = "free";
}

export async function runPreparedQuery<T>(p: Promise<T>): Promise<T> {
  if (IS_PGLITE) {
    await run(aquireDBMutex);
  }
  const result = await p;
  releaseDBMutex();
  return result;
}

export const getConnection = (
  creds?: PoolConfig,
  readonly = false,
): pg.Pool => {
  if (!creds) {
    creds = {
      host: ENV.DB_HOST,
      user: ENV.DB_USER,
      password: ENV.DB_PW,
      database: ENV.DB_NAME,
      port: ENV.DB_PORT,
    };
  }
  if (readonly && readonlyDBConn) return readonlyDBConn;

  // TODO: make this configurable for non pglite instances
  const MAX_CONNECTIONS = IS_PGLITE ? 1 : 10;

  const pool = new pg.Pool({ ...creds, max: MAX_CONNECTIONS });
  pool.on("error", (err: unknown) =>
    log.remote(
      ComponentNames.PAIMA_DB,
      ["query"],
      SeverityNumber.ERROR,
      (log) => log(err),
    ));
  pool.on("connect", (_client: PoolClient) => {
    // On each new client initiated, need to register for error(this is a serious bug on pg, the client throw errors although it should not)
    // https://github.com/brianc/node-postgres/issues/2499#issuecomment-805477725
    _client.on("error", (err: Error) => {
      log.remote(
        ComponentNames.PAIMA_DB,
        ["connect"],
        SeverityNumber.ERROR,
        (log) => log(err),
      );
    });
  });

  if (readonly) {
    const ensureReadOnly =
      `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`;
    void pool.query(ensureReadOnly); // note: this query modifies the DB state
    readonlyDBConn = pool;
  }

  return pool;
};

// For notifications use a direct (non-pooled) persistent connection.
export const getPersistentConnection = (creds: PoolConfig): Client => {
  const client = new pg.Client(creds);
  client.connect(() => {});
  // https://github.com/brianc/node-postgres/issues/2499#issuecomment-805477725
  // On each new client initiated, need to register for error(this is a serious bug on pg, the client throw errors although it should not)
  client.on("error", (err: Error) => {
    log.remote(
      ComponentNames.PAIMA_DB,
      ["query"],
      SeverityNumber.ERROR,
      (log) => log(err),
    );
  });
  return client;
};
