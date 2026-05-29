/**
 * Apply-stage liveness for /debug/metrics.
 *
 * The serial finalized-block loop in main.ts calls recordAppliedBlock() right
 * after each block COMMITs; the /debug/metrics handler reads `appliedBlockStatus`
 * to report true lag (now − applied block timestamp). Unlike a protocol's `buf`
 * (fetch backlog), this stays high when the node is write/apply-bound.
 *
 * Process-global: one node runs per process, so a module-level singleton keeps
 * main.ts to a single call instead of threading a ref through startHttpServer.
 */
export type AppliedBlockStatus = {
  blockNumber: number | null;
  timestamp: number | null;
  appliedAtMs: number | null;
};

export const appliedBlockStatus: AppliedBlockStatus = {
  blockNumber: null,
  timestamp: null,
  appliedAtMs: null,
};

export function recordAppliedBlock(
  block: { blockNumber: number | bigint; timestamp: number | bigint },
): void {
  appliedBlockStatus.blockNumber = Number(block.blockNumber);
  appliedBlockStatus.timestamp = Number(block.timestamp);
  appliedBlockStatus.appliedAtMs = Date.now();
}
