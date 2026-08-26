import { describe, expect, test } from "bun:test";
import { isWalletSettledState } from "./faucet.ts";

const protocolState = (
  strictlyComplete: boolean,
  pendingCoins: number,
) => ({
  progress: { isStrictlyComplete: () => strictlyComplete },
  pendingCoins: Array.from({ length: pendingCoins }, () => ({})),
});

const settledState = () => ({
  pending: { all: [] as unknown[] },
  shielded: protocolState(true, 0),
  unshielded: protocolState(true, 0),
  dust: protocolState(true, 0),
});

describe("wallet replay settlement", () => {
  test("rejects the stale strictly-complete state observed after node finality", () => {
    const state = settledState();
    state.pending.all.push({});
    state.shielded.pendingCoins.push({});
    state.dust.pendingCoins.push({});

    expect(isWalletSettledState(state)).toBe(false);
  });

  test("rejects pending wallet coins after indexer pending status clears", () => {
    const state = settledState();
    state.dust.pendingCoins.push({});

    expect(isWalletSettledState(state)).toBe(false);
  });

  test("requires all protocol progress and pending state to settle", () => {
    const incomplete = settledState();
    incomplete.shielded.progress.isStrictlyComplete = () => false;

    expect(isWalletSettledState(incomplete)).toBe(false);
    expect(isWalletSettledState(settledState())).toBe(true);
  });
});
