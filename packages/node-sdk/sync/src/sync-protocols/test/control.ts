/**
 * Test-only control plane for the synthetic `test` sync protocol.
 *
 * The chain tip ("latest block") is held in a process-wide registry keyed by
 * sync-protocol name, rather than in config, so a single test can advance it
 * deterministically between simulated restarts. (Immutable config fields like
 * `startTime` cannot change across a restart, so they can't drive this.)
 *
 * When no tip is registered for a protocol, the fetcher falls back to a
 * wall-clock tip derived from `startTime`/`blockTimeMS` (see fetcher.ts).
 */
const tips = new Map<string, number>();

/**
 * Stages of the sync/merge pipeline that tests can force to fail, to prove
 * a failure there doesn't crash the process (see sync.ts / merge.ts).
 */
export type FailStage = "readData" | "updateState" | "producerChannel" | "merge";

const faults = new Map<string, number>();
const faultKey = (protocolName: string, stage: FailStage) => `${protocolName}:${stage}`;

export const TestChainControl = {
  /** Set the current chain tip (latest available block) for a protocol. */
  setTip(protocolName: string, tip: number): void {
    tips.set(protocolName, tip);
  },
  /** Get the manually-controlled tip, or undefined to fall back to wall-clock. */
  getTip(protocolName: string): number | undefined {
    return tips.get(protocolName);
  },
  /** Make the next `times` calls to `stage` for this protocol throw a synthetic error. */
  failNext(protocolName: string, stage: FailStage, times = 1): void {
    faults.set(faultKey(protocolName, stage), times);
  },
  /**
   * Called by the synthetic protocol at each injectable stage. Returns true (and
   * consumes one pending failure) if this call should throw.
   */
  consumeFailure(protocolName: string, stage: FailStage): boolean {
    const key = faultKey(protocolName, stage);
    const remaining = faults.get(key) ?? 0;
    if (remaining <= 0) return false;
    if (remaining === 1) faults.delete(key);
    else faults.set(key, remaining - 1);
    return true;
  },
  /** Reset all tips and pending faults (call between tests). */
  clear(): void {
    tips.clear();
    faults.clear();
  },
};
