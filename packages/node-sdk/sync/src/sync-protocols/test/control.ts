/**
 * Test-only control plane for the synthetic `test` sync protocol.
 *
 * The chain's tip and its history are held here rather than in config, so a
 * single test can change them deterministically while a node is running.
 * (Immutable config fields like `startTime` cannot change across a restart, so
 * they can't drive this.)
 *
 * **Cross-process by design.** The reproduction harness runs each node in its
 * own subprocess, so a plain in-memory registry in the test process would never
 * reach the node — the harness can only pass values at spawn time. When
 * `TEST_CHAIN_CONTROL_FILE` is set, this registry is backed by that JSON file
 * instead: the test process writes, the node process reads, and a test can move
 * a running node's chain underneath it. Reads are cached briefly because the
 * fetcher consults them per block.
 *
 * Without that env var the registry is purely in-memory, which is what
 * same-process callers and the harness's spawn-time tip propagation use.
 */
import { readFileSync, writeFileSync } from "node:fs";

/**
 * A simulated chain reorganisation.
 *
 * The synthetic chain derives each block's hash from its timestamp, which is a
 * pure function of the block number — so without this, its history can never
 * change and a reorg cannot be reproduced. Registering a fork mixes `nonce`
 * into the hash of every block at or above `fromBlock`, exactly as a real
 * reorg replaces the blocks after the fork point with different ones.
 */
export type ChainFork = {
  /** First block number whose hash changes. */
  fromBlock: number;
  /** Distinguishes this branch from the original; any short string. */
  nonce: string;
};

type ControlState = {
  tips: Record<string, number>;
  forks: Record<string, ChainFork>;
};

const memory: ControlState = { tips: {}, forks: {} };

/**
 * How long a file-backed read is reused. The fetcher asks per block, so an
 * uncached read would mean one syscall per synthetic block; 50ms is far below
 * any test's reaction time while keeping the cost negligible.
 */
const CACHE_TTL_MS = 50;

let cache: ControlState | undefined;
let cacheReadAtMs = 0;

function controlFile(): string | undefined {
  return process.env.TEST_CHAIN_CONTROL_FILE || undefined;
}

function readState(): ControlState {
  const file = controlFile();
  if (file == null) return memory;

  const now = Date.now();
  if (cache != null && now - cacheReadAtMs < CACHE_TTL_MS) return cache;

  try {
    cache = JSON.parse(readFileSync(file, "utf8")) as ControlState;
  } catch {
    // Not written yet, or a torn read against a concurrent write. Either way the
    // previous view (or an empty one) is a safe answer; the next read retries.
    cache ??= { tips: {}, forks: {} };
  }
  cacheReadAtMs = now;
  return cache;
}

function writeState(mutate: (state: ControlState) => void): void {
  const file = controlFile();
  if (file == null) {
    mutate(memory);
    return;
  }
  // Read-modify-write against the file so writers in different processes don't
  // clobber each other's keys.
  const current = (() => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as ControlState;
    } catch {
      return { tips: {}, forks: {} } as ControlState;
    }
  })();
  mutate(current);
  writeFileSync(file, JSON.stringify(current));
  cache = current;
  cacheReadAtMs = Date.now();
}

export const TestChainControl = {
  /** Set the current chain tip (latest available block) for a protocol. */
  setTip(protocolName: string, tip: number): void {
    writeState((state) => {
      state.tips[protocolName] = tip;
    });
  },
  /** Get the manually-controlled tip, or undefined to fall back to wall-clock. */
  getTip(protocolName: string): number | undefined {
    return readState().tips[protocolName];
  },
  /**
   * Rewrite this protocol's history at and above `fork.fromBlock`.
   *
   * Combine with {@link TestChainControl.setTip} to model the full sequence:
   * drop the tip back below `fromBlock` (the chain shortens), register the
   * fork, then raise the tip again (the new branch extends past the old head).
   */
  setFork(protocolName: string, fork: ChainFork): void {
    writeState((state) => {
      state.forks[protocolName] = fork;
    });
  },
  /** The registered fork for a protocol, if any. */
  getFork(protocolName: string): ChainFork | undefined {
    return readState().forks[protocolName];
  },
  /** Reset all tips and forks (call between tests). */
  clear(): void {
    writeState((state) => {
      state.tips = {};
      state.forks = {};
    });
    memory.tips = {};
    memory.forks = {};
    cache = undefined;
    cacheReadAtMs = 0;
  },
};
