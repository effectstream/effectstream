/**
 * Finalized-block stream backlog for /debug/metrics.
 *
 * `finalized-stream.ts` bumps `produced` when the merge sends a block and `consumed`
 * when the apply loop drains one; their difference is the live subscriber-queue
 * depth that drives backpressure and is surfaced as `inFlight` on /debug/metrics
 * (the one structure flagged unbounded in sync/CLAUDE.md Finding #1). `coalesced`
 * counts empty blocks folded away, so a catch-up test can prove coalescing fired.
 *
 * Process-global: one node runs per process, so a module-level singleton avoids
 * threading a ref through startMerge and the coalescer.
 */
export type FinalizedStreamStatus = {
  produced: number;
  consumed: number;
  coalesced: number;
};

export const finalizedStreamStatus: FinalizedStreamStatus = {
  produced: 0,
  consumed: 0,
  coalesced: 0,
};

export function recordProduced(): void {
  finalizedStreamStatus.produced++;
}

export function recordConsumed(n: number): void {
  finalizedStreamStatus.consumed += n;
}

export function recordCoalesced(n: number): void {
  finalizedStreamStatus.coalesced += n;
}
