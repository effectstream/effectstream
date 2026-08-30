/**
 * Reproduction for the block-processing checkout boundary (spec 00031: G7).
 *
 * `processFinalizedBlockWithRetry` is driven directly against a stub pool: the
 * defect is entirely in the window between `pool.connect()` being issued and
 * its client being assigned, so no database is involved.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Pool, PoolClient } from "pg";
import { run } from "effection";
import { processFinalizedBlockWithRetry } from "../../src/process-blocks.ts";
import type { ChainBlock } from "@effectstream/sync";
import type { StartConfig } from "../../src/types.ts";
import { restoreEnv, saveEnv, settle, sleep, waitUntil } from "./support.ts";

let env: ReturnType<typeof saveEnv>;

beforeEach(() => {
  env = saveEnv(["PGLITE"]);
  // `PGLITE` defaults to true, which turns the per-block mutex on. This test is
  // about the pool checkout, so keep it out of the mutex's way entirely.
  process.env.PGLITE = "false";
});

afterEach(() => restoreEnv(env));

test("G7: halting while the pool checkout is in flight still returns the client", async () => {
  const released: unknown[] = [];
  let resolveConnect: ((client: PoolClient) => void) | undefined;

  const pool = {
    connect: () =>
      new Promise<PoolClient>((resolve) => {
        resolveConnect = resolve;
      }),
  } as unknown as Pool;

  const task = run(() =>
    processFinalizedBlockWithRetry(
      { blockNumber: 1 } as unknown as ChainBlock,
      {} as StartConfig,
      pool,
      null,
    )
  );
  // The operation is cancelled, so its own promise settles as halted.
  void settle(Promise.resolve(task));

  await waitUntil(
    () => resolveConnect !== undefined,
    5_000,
    "pool.connect() issued",
  );
  await task.halt();

  // The pool hands the client over after the halt — exactly what happens when
  // a real checkout wins the race with cancellation. Nobody is left to return
  // it, so the pool is permanently one client short and `pool.end()` hangs.
  const client = {
    release: (error?: Error) => {
      released.push(error ?? null);
    },
  } as unknown as PoolClient;
  resolveConnect!(client);
  await sleep(200);

  expect(released.length).toBe(1);
}, 20_000);
