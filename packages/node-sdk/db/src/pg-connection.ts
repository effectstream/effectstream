import type { Client, PoolClient, PoolConfig } from "pg";
import pg from "pg";
import { ComponentNames, log, SeverityNumber } from "@paima/log";

let readonlyDBConn: pg.Pool | null;

export const getConnection = (creds: PoolConfig, readonly = false): pg.Pool => {
  if (readonly && readonlyDBConn) return readonlyDBConn;

  const pool = new pg.Pool(creds);
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
