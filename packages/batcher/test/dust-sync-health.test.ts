// An operator has to be able to tell a syncing batcher from a stuck one.
//
// A Midnight fee wallet's dust cold sync takes ~66 minutes on preprod. For that
// whole window `getHealthInfo()` reported `walletsReady: 0` and nothing else —
// identical to a batcher whose snapshot offset sits past the indexer's event
// log and which will never start at all (Phase 1 §2). Both look like a hang;
// one wants patience, the other wants the snapshot deleted.
//
// The classifier is pure so health info stays what it claims to be: cached
// state only, no chain calls, safe to poll.

import { describe, expect, test } from "bun:test";
import {
  classifyDustSyncState,
  type DustSyncSample,
} from "../adapters/midnight-balancing-adapter.ts";

const NOW = 1_700_000_000_000;
const STALLED_AFTER_MS = 60_000;

const sample = (over: Partial<DustSyncSample> = {}): DustSyncSample => ({
  appliedIndex: 500_000n,
  target: 1_438_641n,
  isConnected: true,
  updatedAtMs: NOW - 1_000,
  advancedAtMs: NOW - 1_000,
  ...over,
});

describe("dust sync state classification", () => {
  test("advancing through a long replay is syncing, not stuck", () => {
    expect(classifyDustSyncState(sample(), NOW, STALLED_AFTER_MS)).toEqual("syncing");
  });

  test("caught up and connected is complete", () => {
    expect(
      classifyDustSyncState(
        sample({ appliedIndex: 1_438_641n, target: 1_438_641n }),
        NOW,
        STALLED_AFTER_MS,
      ),
    ).toEqual("complete");
  });

  test("a wallet at the tip stays complete however long it sits quiet", () => {
    // Emissions stop once there is nothing to apply. Ageing a complete wallet
    // into "stalled" would page someone for a healthy batcher.
    expect(
      classifyDustSyncState(
        sample({
          appliedIndex: 1_438_641n,
          target: 1_438_641n,
          updatedAtMs: NOW - 86_400_000,
          advancedAtMs: NOW - 86_400_000,
        }),
        NOW,
        STALLED_AFTER_MS,
      ),
    ).toEqual("complete");
  });

  test("no progress for longer than the stall window is stalled", () => {
    expect(
      classifyDustSyncState(sample({ advancedAtMs: NOW - 61_000 }), NOW, STALLED_AFTER_MS),
    ).toEqual("stalled");
  });

  test("the measured offset-past-log signature reads as stalled", () => {
    // Restored at 999999, nothing applied, never connected, no target ever
    // learned — the failure that used to look exactly like a slow sync.
    expect(
      classifyDustSyncState(
        {
          appliedIndex: 999_999n,
          target: 0n,
          isConnected: false,
          updatedAtMs: NOW - 90_000,
          advancedAtMs: NOW - 90_000,
        },
        NOW,
        STALLED_AFTER_MS,
      ),
    ).toEqual("stalled");
  });

  test("a fresh cold sync that has not emitted yet is syncing, not stalled", () => {
    // Nothing has happened yet because nothing has had time to; calling that
    // stalled would make every start look broken for its first minute.
    expect(
      classifyDustSyncState(
        {
          appliedIndex: 0n,
          target: 0n,
          isConnected: false,
          updatedAtMs: NOW - 5_000,
          advancedAtMs: NOW - 5_000,
        },
        NOW,
        STALLED_AFTER_MS,
      ),
    ).toEqual("syncing");
  });

  test("a wallet nobody has sampled is unknown, not healthy", () => {
    expect(classifyDustSyncState(null, NOW, STALLED_AFTER_MS)).toEqual("unknown");
  });
});
