/**
 * pg.Pool query helpers shared by the test harness (parent process, used for
 * assertions) and {@link ./node-runner.ts} (child process, used to decide when a
 * node has finished syncing). No cluster / runtime imports.
 *
 * On PGLite every query is serialized through the engine's process-global DB
 * mutex — see {@link q}. On a real Postgres server that mutex is a no-op and
 * these are plain pooled queries.
 */
import type pg from "pg";
import { run } from "effection";
import { ENV } from "@effectstream/utils/node-env";
import { acquireDBMutex, releaseDBMutex } from "@effectstream/db";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a query, serialized through the engine's process-global DB mutex on PGLite
 * (a single WASM backend that two overlapping queries corrupt). node-runner
 * polls while the engine syncs in the SAME process, so taking the same mutex the
 * engine uses guarantees no overlap — they share the module-global lock even
 * across separate `run()` roots. On real Postgres the mutex is a no-op.
 */
async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  pool: pg.Pool,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  if (!ENV.PGLITE) {
    return (await pool.query<T>(sql, params)).rows;
  }
  const lock = "repro-poll";
  await run(() => acquireDBMutex(lock));
  try {
    return (await pool.query<T>(sql, params)).rows;
  } finally {
    releaseDBMutex(lock);
  }
}

/** Latest finalized effectstream block height (incl. empty blocks). 0 if none. */
export async function latestFinalizedHeight(pool: pg.Pool): Promise<number> {
  try {
    const rows = await q<{ h: number | null }>(
      pool,
      `SELECT MAX(block_height)::int AS h FROM effectstream.effectstream_blocks
       WHERE effectstream_block_hash IS NOT NULL`,
    );
    return rows[0]?.h ?? 0;
  } catch (e) {
    // The system migrations may not have created the table yet during boot.
    if ((e as { code?: string })?.code === "42P01") return 0;
    throw e;
  }
}

/** Highest persisted page-queue number for a protocol (-1 if none yet). */
export async function maxPage(
  pool: pg.Pool,
  protocolName: string,
): Promise<number> {
  try {
    const rows = await q<{ p: number | null }>(
      pool,
      `SELECT MAX(page_number)::int AS p FROM effectstream.sync_protocol_pagination
       WHERE protocol_name = $1`,
      [protocolName],
    );
    return rows[0]?.p ?? -1;
  } catch (e) {
    if ((e as { code?: string })?.code === "42P01") return -1;
    throw e;
  }
}

/** Wait until finalized height reaches `target` (or throw on timeout). */
export async function waitForHeight(
  pool: pg.Pool,
  target: number,
  timeoutMs = 30_000,
): Promise<number> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const h = await latestFinalizedHeight(pool);
    if (h >= target) return h;
    await sleep(50);
  }
  throw new Error(
    `waitForHeight(${target}) timed out at ${await latestFinalizedHeight(pool)}`,
  );
}

/**
 * Wait until the finalized height stops advancing for `quietMs` (the system has
 * reached its deterministic stable state given fixed tips).
 */
export async function waitUntilStable(
  pool: pg.Pool,
  { quietMs = 800, timeoutMs = 30_000 } = {},
): Promise<number> {
  const startedAt = Date.now();
  let last = -1;
  let lastChange = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const h = await latestFinalizedHeight(pool);
    if (h !== last) {
      last = h;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= quietMs) {
      return h;
    }
    await sleep(50);
  }
  return last;
}

/** Wait until a protocol's persisted page reaches `target` (or throw). */
export async function waitForPage(
  pool: pg.Pool,
  protocolName: string,
  target: number,
  timeoutMs = 30_000,
): Promise<number> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const p = await maxPage(pool, protocolName);
    if (p >= target) return p;
    await sleep(50);
  }
  throw new Error(
    `waitForPage(${protocolName}, ${target}) timed out at ${await maxPage(pool, protocolName)}`,
  );
}

/** Count primitive_accounting rows whose payload carries the given marker. */
export async function countEventRows(
  pool: pg.Pool,
  marker: string,
): Promise<number> {
  const rows = await q<{ c: number | null }>(
    pool,
    `SELECT COUNT(*)::int AS c FROM effectstream.primitive_accounting
     WHERE payload->>'marker' = $1`,
    [marker],
  );
  return rows[0]?.c ?? 0;
}

/** Page-queue rows for a protocol (the durable per-chunk queue). */
export async function pageRows(
  pool: pg.Pool,
  protocolName: string,
): Promise<{ page_number: number }[]> {
  return await q<{ page_number: number }>(
    pool,
    `SELECT page_number FROM effectstream.sync_protocol_pagination
     WHERE protocol_name = $1 ORDER BY page_number ASC`,
    [protocolName],
  );
}
