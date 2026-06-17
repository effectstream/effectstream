/** Empty-block coalescing during deep catch-up: fold consecutive no-op blocks into one transaction. */
import type { ChainBlock } from "@effectstream/sync";
import { call, type Operation, race, sleep, until } from "effection";
import type { Pool, PoolClient } from "pg";
import {
  acquireDBMutex,
  blockHeightDone,
  deleteEmptyBlocks,
  getEarliestScheduledBlockHeight,
  getEarliestScheduledTimestamp,
  getMigrationsForBlockHeight,
  isTransientPgError,
  poolErrors,
  releaseDBMutex,
  removePages,
  saveLastBlock,
  upsertPage,
} from "@effectstream/db";
import { Buffer } from "node:buffer";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import { generateEffectstreamBlockHash, Prando } from "@effectstream/crypto";
import type { EffectstreamBlockHash } from "@effectstream/utils";
import type { DBMigrations } from "@effectstream/runtime";

/** Scheduled-input boundaries sampled once at run start (stable until the next non-empty block). */
export type EmptyRunBoundaries = {
  minScheduledBlockHeight: number | null;
  minScheduledTimestampMs: number | null;
};

export const MAX_EMPTY_RUN = 5_000;

const MAX_RETRY_BACKOFF_MS = 5_000;

export function* loadEmptyRunBoundaries(
  dbConn: Pool,
): Operation<EmptyRunBoundaries> {
  const [bh] = yield* until(getEarliestScheduledBlockHeight.run(undefined, dbConn));
  const [ts] = yield* until(getEarliestScheduledTimestamp.run(undefined, dbConn));
  return {
    minScheduledBlockHeight: bh?.min_block_height ?? null,
    minScheduledTimestampMs: ts?.min_timestamp != null
      ? new Date(ts.min_timestamp).getTime()
      : null,
  };
}

/** Mirrors the empty-block checks in process-blocks.ts without DB/STF work. */
export function isCoalescableEmptyBlock(
  value: ChainBlock,
  boundaries: EmptyRunBoundaries,
  migrations: DBMigrations[] | undefined,
): boolean {
  if (value.primitives.length > 0) return false;
  if (
    getMigrationsForBlockHeight(migrations, value.blockNumber, value.blockNumber)
      .length > 0
  ) {
    return false;
  }
  if (
    boundaries.minScheduledBlockHeight != null &&
    value.blockNumber >= boundaries.minScheduledBlockHeight
  ) {
    return false;
  }
  if (
    boundaries.minScheduledTimestampMs != null &&
    boundaries.minScheduledTimestampMs <= value.timestamp
  ) {
    return false;
  }
  return true;
}

export function* processCoalescedEmptyRun(
  endpoint: ChainBlock,
  pool: Pool,
  previousBlockHash: EffectstreamBlockHash | null,
): Operation<void> {
  const lockName = `processing-blocks:${endpoint.blockNumber}`;
  let attempt = 0;
  while (true) {
    let dbClient: PoolClient | undefined;
    let transientErr: unknown;
    try {
      yield* acquireDBMutex(lockName);
      dbClient = yield* until(pool.connect());
      yield* writeEndpoint(
        endpoint,
        dbClient as unknown as Pool,
        previousBlockHash,
      );
      return;
    } catch (err) {
      if (!isTransientPgError(err)) throw err;
      transientErr = err;
    } finally {
      releaseDBMutex(lockName);
      if (dbClient) {
        try {
          dbClient.release(transientErr as Error | undefined);
        } catch {
          /* already released/destroyed */
        }
      }
    }

    attempt++;
    poolErrors.log(transientErr, ["sync-write"]);
    const backoffMs = Math.min(500 * 2 ** (attempt - 1), MAX_RETRY_BACKOFF_MS);
    log.local(
      ComponentNames.EFFECTSTREAM_SYNC,
      "block-processing",
      SeverityNumber.WARN,
      (l) =>
        l(
          `transient db error on coalesced run → block ${endpoint.blockNumber}; retry #${attempt} in ${backoffMs}ms: ${
            String(transientErr)
          }`,
        ),
    );
    yield* sleep(backoffMs);
  }
}

/** One transaction for the run endpoint; matches process-blocks.ts empty-block writes. */
function* writeEndpoint(
  endpoint: ChainBlock,
  dbConn: Pool,
  previousBlockHash: EffectstreamBlockHash | null,
): Operation<void> {
  const blockHash = generateEffectstreamBlockHash(endpoint, previousBlockHash);
  const seed = new Prando(blockHash).seed.toString();
  try {
    yield* until(dbConn.query("BEGIN"));

    yield* call(() =>
      saveLastBlock.run({
        block_height: endpoint.blockNumber,
        ver: 0,
        main_chain_block_hash: Buffer.from(endpoint.blockNumber.toString()),
        seed,
        ms_timestamp: new Date(endpoint.timestamp),
      }, dbConn)
    );

    yield* call(() => deleteEmptyBlocks.run(undefined, dbConn));
    yield* call(() =>
      blockHeightDone.run({
        block_hash: Buffer.from("0x0"),
        block_height: endpoint.blockNumber,
      }, dbConn)
    );

    for (const { protocol_name, lastPage } of endpoint.resumePages) {
      yield* until(
        upsertPage.run({
          protocol_name,
          page_number: lastPage.ownBlockNumber,
          page: JSON.stringify(lastPage),
        }, dbConn),
      );
      yield* until(
        removePages.run({
          protocol_name,
          page_number: lastPage.ownBlockNumber,
        }, dbConn),
      );
    }

    yield* until(dbConn.query("COMMIT"));
    poolErrors.markHealthy();
  } catch (err) {
    try {
      yield* until(dbConn.query("ROLLBACK"));
    } catch (rollbackErr) {
      log.remote(
        ComponentNames.EFFECTSTREAM_SYNC,
        "block-processing",
        SeverityNumber.WARN,
        (l) =>
          l(
            `ROLLBACK failed for coalesced run → block ${endpoint.blockNumber} (connection likely dead): ${
              String(rollbackErr)
            }`,
          ),
      );
    }
    throw err;
  }
}

export type FinalizedBlockSubscription = {
  next(): Operation<IteratorResult<ChainBlock, void>>;
};

function* readFinalizedBlock(
  subscription: FinalizedBlockSubscription,
): Operation<{ tag: "item"; value: ChainBlock } | { tag: "done" }> {
  const n = yield* subscription.next();
  if (n.done) return { tag: "done" };
  // IteratorResult value type does not narrow on `done` under non-strict tsconfig.
  return { tag: "item", value: n.value as ChainBlock };
}

export type EmptyBlockCoalescerOptions = {
  enabled: boolean;
  subscription: FinalizedBlockSubscription;
  pool: Pool;
  migrations: DBMigrations[] | undefined;
  /** Coalesce only while `now - block.timestamp` exceeds this. Undefined disables lag gating. */
  lagThresholdMs: number | undefined;
  getPreviousBlockHash: () => EffectstreamBlockHash | null;
  onFlush: (endpoint: ChainBlock, length: number) => void;
  idleFlushMs?: number;
};

export type CoalescerAdvanceResult = {
  block: ChainBlock;
  /** Boundaries loaded during this block's coalescability check, or null if not loaded. */
  boundaries: EmptyRunBoundaries | null;
};

export type EmptyBlockCoalescer = {
  advance(): Operation<CoalescerAdvanceResult | undefined>;
};

export function createEmptyBlockCoalescer(
  opts: EmptyBlockCoalescerOptions,
): EmptyBlockCoalescer {
  const idleFlushMs = opts.idleFlushMs ?? 250;
  let pendingRun:
    | { endpoint: ChainBlock; boundaries: EmptyRunBoundaries; length: number }
    | null = null;

  function* flush(): Operation<void> {
    if (pendingRun == null) return;
    const { endpoint, length } = pendingRun;
    yield* processCoalescedEmptyRun(
      endpoint,
      opts.pool,
      opts.getPreviousBlockHash(),
    );
    pendingRun = null;
    opts.onFlush(endpoint, length);
  }

  function* nextItem(): Operation<
    { tag: "item"; value: ChainBlock } | { tag: "done" } | { tag: "idle" }
  > {
    if (pendingRun == null) return yield* readFinalizedBlock(opts.subscription);
    return yield* race([
      readFinalizedBlock(opts.subscription),
      (function* () {
        yield* sleep(idleFlushMs);
        return { tag: "idle" as const };
      })(),
    ]);
  }

  function* advance(): Operation<CoalescerAdvanceResult | undefined> {
    if (!opts.enabled) {
      const n = yield* readFinalizedBlock(opts.subscription);
      return n.tag === "done" ? undefined : { block: n.value, boundaries: null };
    }
    while (true) {
      const next = yield* nextItem();
      if (next.tag === "idle") {
        yield* flush();
        continue;
      }
      if (next.tag === "done") {
        yield* flush();
        return undefined;
      }
      const value = next.value;
      const behindTip = opts.lagThresholdMs != null &&
        Date.now() - value.timestamp > opts.lagThresholdMs;
      if (behindTip && value.primitives.length === 0) {
        const boundaries = pendingRun?.boundaries ??
          (yield* loadEmptyRunBoundaries(opts.pool));
        if (isCoalescableEmptyBlock(value, boundaries, opts.migrations)) {
          pendingRun = pendingRun
            ? { boundaries, endpoint: value, length: pendingRun.length + 1 }
            : { boundaries, endpoint: value, length: 1 };
          if (pendingRun.length >= MAX_EMPTY_RUN) yield* flush();
          continue;
        }
        // Not coalesceable (migration or scheduled input at this height) but
        // boundaries were just loaded — pass them to the apply loop so it can
        // skip the scheduled-input queries if they confirm null.
        yield* flush();
        return { block: value, boundaries };
      }
      yield* flush();
      return { block: value, boundaries: null };
    }
  }

  return { advance };
}
