import type { Client, PoolClient, PoolConfig } from "pg";
import pg from "pg";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import { type Operation, run, sleep } from "effection";
import { ENV } from "@effectstream/utils/node-env";

let readonlyDBConn: pg.Pool | null;

// PGLite does not support multiple connections, so we need to use a mutex to ensure that only one query is executed at a time.
// * For transactions use yield* acquireDBMutex(); ...Your Operations... releaseDBMutex();
// * For single queries use await runPreparedQuery(myQuery.run(params, dbConn));
// IMPORTANT: This is only for PGLite instances, for full pgsql servers, this is not needed.0
// TODO This is a very simple mutex implementation.
//      It releases the mutex randomly, and not in order.
//      It only works for deno's single-threaded runtime.
//      pglite exports async-mutex, so we can use that for a proper solution.
let db_mutex: "free" | "locked" = "free";
/**
 * Acquires a mutex to ensure that only one query is executed at a time.
 * If running in PGLite, it will acquire a mutex to ensure that only one query is executed at a time.
 * If running in a full pgsql server, it will do nothing.
 * Always run run `releaseDBMutex()` after the query locks no longer needed, other threads are blocked until the mutex is released.
 */
const _waitUntilFree = {
  waiting: [] as {
    priority: 'high' | 'low';
    name: string;
    date: string;
  }[],
  running: {
    name: "",
    date: "",
  },
  db_mutex,
};

// Get data for database.
export const waitUntilFree = () => {
  return {
    ..._waitUntilFree,
    db_mutex,
  };
};

export function* acquireDBMutex(lockName: string, priority: 'high' | 'low' = 'low'): Operation<void> {
  if (!ENV.PGLITE) return;
  _waitUntilFree.waiting.push({
    priority,
    name: lockName,
    date: new Date().toISOString(),
  });

  while (true) {
    // If there is a high priority lock, wait for it to be released.
    if (priority === 'low' && _waitUntilFree.waiting.find((w) => w.priority === 'high')) {
      // do nothing
    }

    // If there is no lock, acquire it.
    else if (db_mutex === "free") {
      db_mutex = "locked";
      _waitUntilFree.waiting.splice(
        _waitUntilFree.waiting.findIndex((w) => w.name === lockName),
        1,
      );
      _waitUntilFree.running = {
        name: lockName,
        date: new Date().toISOString(),
      };
      break;
    }

    // This is only for debugging purposes.
    const i = _waitUntilFree.waiting.findIndex((w) => w.name === lockName);
    if (i !== -1) {
      const now = new Date().getTime();
      const waitingSince = new Date(_waitUntilFree.waiting[i].date).getTime();
      const waitingFor = now - waitingSince;
      if (waitingFor > 2500) {
        console.error(
          `[DB Mutex] Waiting for ${waitingFor}[ms] for ${lockName}. 
Locked by ${_waitUntilFree.running.name}. This is a critical error, please restart the sync service.`,
        );
      }
    }

    yield* sleep(10);
  }
}

/**
 * Releases a mutex to allow other queries to be executed.
 * If running in PGLite, it will release a mutex to allow other queries to be executed.
 * If running in a full pgsql server, it will do nothing.
 * Do not call this function if you did not call `acquireDBMutex()` before.
 */
export function releaseDBMutex(lockName: string) {
  if (_waitUntilFree.running.name !== lockName) {
    console.error(
      "releasing mutex",
      _waitUntilFree.running,
      "but the lock name does not match",
      lockName,
    );
  }
  _waitUntilFree.running = { name: "", date: "" };
  db_mutex = "free";
}

/**
 * Helper function to run a db query in a thread-safe manner.
 * If running in PGLite, it will acquire a mutex to ensure that only one query is executed at a time.
 * If running in a full pgsql server, it will run normally.
 */
export async function runPreparedQuery<T>(
  p: Promise<T[]>,
  name: string,
): Promise<T[]> {
  let result: T[];
  try {
    if (ENV.PGLITE) {
      await run(() => acquireDBMutex(`pq:${name}`));
    }

    let t;
    const timeout: Promise<T[]> = new Promise((resolve) => {
      t = setTimeout(() => {
        console.error("[CRITICAL ERROR] Database query timed out", name);
        if (ENV.PGLITE) {
          // TODO: This is a temporary fix to allow the query to continue.
          // Only allow to continue in PGLITE.
          // We suspect this is PGLITE specific error.
          resolve([]);
        }
      }, 2500);
    });
    result = await Promise.race([p, timeout]);
    clearTimeout(t);
  } finally {
    releaseDBMutex(`pq:${name}`);
  }
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
      password: ENV.PGLITE ? undefined : ENV.DB_PW,
      database: ENV.DB_NAME,
      port: ENV.DB_PORT,
    };
  }
  if (readonly && readonlyDBConn) return readonlyDBConn;

  // TODO: make this configurable for non pglite instances
  const MAX_CONNECTIONS = ENV.PGLITE ? 1 : 10;

  const pool = new pg.Pool({ ...creds, max: MAX_CONNECTIONS });
  pool.on("error", (err: unknown) =>
    log.remote(
      ComponentNames.EFFECTSTREAM_PGLITE,
      ["query"],
      SeverityNumber.ERROR,
      (log) => log(err),
    ));
  pool.on("connect", (_client: PoolClient) => {
    // On each new client initiated, need to register for error(this is a serious bug on pg, the client throw errors although it should not)
    // https://github.com/brianc/node-postgres/issues/2499#issuecomment-805477725
    _client.on("error", (err: Error) => {
      log.remote(
        ComponentNames.EFFECTSTREAM_PGLITE,
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
      ComponentNames.EFFECTSTREAM_PGLITE,
      ["query"],
      SeverityNumber.ERROR,
      (log) => log(err),
    );
  });
  return client;
};
