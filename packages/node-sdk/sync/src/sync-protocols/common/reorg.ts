/**
 * Reorg detection for source chains.
 *
 * A reorg is invisible to forward-only sync: once a block is merged and
 * committed the node never looks at it again, so a chain that replaces its
 * history leaves the node building on state derived from blocks that no longer
 * exist. `confirmationDepth` makes this rare, not impossible, and nothing
 * reported it when it did happen.
 *
 * Detection compares the hash the node recorded for a block against the hash
 * the chain reports for that block *now*. Recording happens at commit time
 * (`runtime/process-blocks.ts` writes `ChainBlock.blockInfo` into
 * `effectstream.sync_protocol_block_hash`); re-checking happens here, on the
 * fetch loop.
 *
 * **Detection is opt-in per chain.** It needs a "hash of the block at height N"
 * capability, which the per-chain fetchers do not uniformly have, so a fetcher
 * signals support by implementing {@link ReorgDetectingFetcher}. Chains that do
 * not are skipped — reported honestly via {@link SyncState#reorgDetectionSupported}
 * rather than silently appearing to be monitored.
 *
 * **Nothing is repaired automatically.** On detection the node logs, writes an
 * incident report for an operator (see `runtime/src/reorg-report.ts`), flags
 * `/health`, and carries on. Rolling state back is a destructive, judgement-
 * dependent operation; the report contains the sequence and the SQL to do it.
 */
import type { Operation } from "effection";
import { call } from "effection";
import { ComponentNames, log, SeverityNumber } from "@effectstream/log";
import { getBlockHashesFrom } from "@effectstream/db";
import type { PoolClient } from "pg";

/**
 * Implemented by fetchers that can be asked for the hash of an arbitrary past
 * block. Optional: a fetcher without it simply gets no reorg detection.
 */
export interface ReorgDetectingFetcher<Page> {
  /** Hash at `page` as the chain reports it now, or null if it no longer exists. */
  getBlockHashAt(page: Page): Operation<string | null>;
}

export function isReorgDetectingFetcher<Page>(
  fetcher: unknown,
): fetcher is ReorgDetectingFetcher<Page> {
  return typeof (fetcher as { getBlockHashAt?: unknown })?.getBlockHashAt ===
    "function";
}

/**
 * Called when a reorg is detected. The runtime registers the handler that
 * writes the operator incident report; sync must not depend on the runtime, so
 * this is a registration point rather than a direct import (the same shape as
 * `orchestration/merge.ts:mergeCoalescingBoundaries`).
 *
 * Returns the path of the report it wrote, if any.
 */
export type ReorgHandler = (
  detection: ReorgDetection,
  dbConn: PoolClient,
) => Operation<string | undefined>;

let reorgHandler: ReorgHandler | undefined;

export function setReorgHandler(handler: ReorgHandler | undefined): void {
  reorgHandler = handler;
}

export function getReorgHandler(): ReorgHandler | undefined {
  return reorgHandler;
}

/** What a detection pass found. */
export type ReorgDetection = {
  protocolName: string;
  /** Lowest source block whose hash no longer matches what we recorded. */
  forkBlock: number;
  /**
   * Conservative lower bound for the fork: one past the highest block still
   * known to match.
   *
   * Recorded history is not necessarily contiguous — empty-block coalescing
   * commits a run of blocks as one unit, so only the run's endpoint gets a hash
   * row. When the block below `forkBlock` was never recorded, the true fork sits
   * somewhere in that gap and `forkBlock` alone would understate the damage.
   * Impact is assessed from this bound instead.
   */
  forkBlockLowerBound: number;
  /** Highest source block we had recorded — the old branch's head. */
  previousHead: number;
  /** How many recorded blocks are invalidated: `previousHead - forkBlock + 1`. */
  depth: number;
  recordedHash: string;
  currentHash: string | null;
  /**
   * Oldest block we still hold a hash for. When this equals `forkBlock` the
   * scan hit the bottom of its retained history, so the true fork may be
   * deeper and every figure derived from it is a lower bound.
   */
  oldestRetainedBlock: number;
  detectedAtMs: number;
};

/**
 * Check whether the recorded history for this protocol still matches the chain.
 *
 * Walks the recorded hashes from the oldest retained block upward and returns
 * the first mismatch. The scan is bounded by the retention window written at
 * commit time, so a reorg deeper than that window reports the oldest retained
 * block as the fork point — a floor, correctly flagged as such by
 * `depthExceedsHistory` in the report.
 *
 * Returns `undefined` when history is intact, which is the overwhelmingly
 * common case, and costs one hash lookup at the recorded head.
 */
export function* detectReorg<Page>(
  protocolName: string,
  fetcher: ReorgDetectingFetcher<Page>,
  dbConn: PoolClient,
  /** Converts a stored block number into whatever the fetcher pages by. */
  toPage: (blockNumber: number) => Page,
): Operation<ReorgDetection | undefined> {
  const recorded = yield* call(() =>
    getBlockHashesFrom.run({ protocol_name: protocolName, block_number: 0 }, dbConn)
  );
  if (recorded.length === 0) return undefined;

  // Fast path: if the most recent recorded block still matches, no reorg can
  // have touched anything below it either (a reorg rewrites a suffix).
  const head = recorded[recorded.length - 1];
  const headHash = yield* fetcher.getBlockHashAt(toPage(head.block_number));
  if (headHash === head.block_hash) return undefined;

  log.remote(
    ComponentNames.EFFECTSTREAM_SYNC,
    [protocolName, "reorg"],
    SeverityNumber.WARN,
    (l) =>
      l(
        `hash mismatch at block ${head.block_number}: recorded ${head.block_hash}, chain reports ${headHash}. Locating fork point...`,
      ),
  );

  // Binary search for the lowest mismatching block. History is a matching
  // prefix followed by a mismatching suffix, so the boundary is well-defined.
  let lo = 0;
  let hi = recorded.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const entry = recorded[mid];
    const current = yield* fetcher.getBlockHashAt(toPage(entry.block_number));
    if (current === entry.block_hash) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const fork = recorded[lo];
  const currentHash = yield* fetcher.getBlockHashAt(toPage(fork.block_number));

  // Recorded history can have gaps (see forkBlockLowerBound). Everything above
  // the highest still-matching block is suspect, not just the first mismatch we
  // happen to hold a row for.
  const lastMatching = lo > 0 ? recorded[lo - 1].block_number : undefined;
  const forkBlockLowerBound = lastMatching != null
    ? lastMatching + 1
    : recorded[0].block_number;

  return {
    protocolName,
    forkBlock: fork.block_number,
    forkBlockLowerBound,
    previousHead: head.block_number,
    depth: head.block_number - forkBlockLowerBound + 1,
    recordedHash: fork.block_hash,
    currentHash,
    oldestRetainedBlock: recorded[0].block_number,
    detectedAtMs: Date.now(),
  };
}
