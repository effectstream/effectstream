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

export const TestChainControl = {
  /** Set the current chain tip (latest available block) for a protocol. */
  setTip(protocolName: string, tip: number): void {
    tips.set(protocolName, tip);
  },
  /** Get the manually-controlled tip, or undefined to fall back to wall-clock. */
  getTip(protocolName: string): number | undefined {
    return tips.get(protocolName);
  },
  /** Reset all tips (call between tests). */
  clear(): void {
    tips.clear();
  },
};
