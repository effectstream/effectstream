// The flag matrix is the part most likely to be silently wrong, so it is
// asserted field-by-field at the WASM boundary. A test that merely constructed
// default strictness would pass vacuously — every field defaults to `true`.

import { describe, expect, test } from "bun:test";
import {
  checkTtlMargin,
  type LedgerBinding,
  type StrictnessFlags,
  strictnessFor,
  validateWellFormed,
} from "../adapters/midnight-tx-validation.ts";
import type { PolicyInspectableTx } from "../adapters/midnight-policy.ts";

/** Records exactly what crossed the boundary. */
function recordingLedger(opts: { throwOnWellFormed?: unknown } = {}) {
  const seen: { flags?: StrictnessFlags; networkId?: string; params?: unknown; now?: Date } = {};
  const ledger: LedgerBinding = {
    blankState(networkId, params) {
      seen.networkId = networkId;
      seen.params = params;
      return { networkId };
    },
    makeStrictness(flags) {
      seen.flags = flags;
      return flags;
    },
    wellFormed(_tx, _state, _strictness, now) {
      seen.now = now;
      if (opts.throwOnWellFormed !== undefined) throw opts.throwOnWellFormed;
    },
  };
  return { ledger, seen };
}

describe("strictness matrix", () => {
  test("both proof flags are false in EVERY row", () => {
    const rows: [Parameters<typeof strictnessFor>[0], Parameters<typeof strictnessFor>[1]][] = [
      ["intake", "unproven"], ["intake", "unbound"], ["intake", "finalized"],
      ["pre-spend", "unproven"], ["pre-spend", "unbound"], ["pre-spend", "finalized"],
      ["pre-submit", "finalized"],
    ];
    for (const [phase, stage] of rows) {
      const f = strictnessFor(phase, stage);
      // verifyContractProofs=true runs op_check against a BLANK state, which
      // false-rejects valid contract calls. It is not merely useless here.
      expect(f.verifyContractProofs).toBe(false);
      expect(f.verifyNativeProofs).toBe(false);
    }
  });

  test("incoming unproven/unbound verifies nothing yet", () => {
    for (const stage of ["unproven", "unbound"] as const) {
      expect(strictnessFor("intake", stage)).toEqual({
        enforceBalancing: false, verifySignatures: false, enforceLimits: false,
        verifyNativeProofs: false, verifyContractProofs: false,
      });
    }
  });

  test("incoming finalized verifies signatures but NOT balancing", () => {
    const f = strictnessFor("pre-spend", "finalized");
    expect(f.verifySignatures).toBe(true);
    // The batcher supplies the dust, so an incoming transaction is not balanced
    // yet. enforceBalancing here would reject every legitimate submission —
    // the spike saw exactly that: "invalid balance … for token Dust".
    expect(f.enforceBalancing).toBe(false);
    expect(f.enforceLimits).toBe(false);
  });

  test("pre-submit checks everything it can", () => {
    const f = strictnessFor("pre-submit", "finalized");
    expect(f.enforceBalancing).toBe(true);
    expect(f.verifySignatures).toBe(true);
    expect(f.enforceLimits).toBe(true);
  });
});

describe("validateWellFormed", () => {
  const args = {
    phase: "pre-spend" as const,
    txStage: "finalized" as const,
    networkId: "undeployed",
    params: { marker: "live" },
    nowMs: 1_700_000_000_000,
  };

  test("passes the live params, the derived stage's flags and nowMs across", () => {
    const { ledger, seen } = recordingLedger();
    expect(validateWellFormed({}, args, ledger).valid).toBe(true);
    expect(seen.params).toEqual({ marker: "live" });
    expect(seen.networkId).toBe("undeployed");
    expect(seen.flags!.verifySignatures).toBe(true);
    expect(seen.now!.getTime()).toBe(args.nowMs);
  });

  test("a throw from the WASM boundary FAILS CLOSED", () => {
    const { ledger } = recordingLedger({ throwOnWellFormed: new Error("invalid network ID") });
    const v = validateWellFormed({}, args, ledger);
    expect(v.valid).toBe(false);
    expect(v.errorCode).toBe("NOT_WELL_FORMED");
    expect(v.reason).toContain("invalid network ID");
  });

  test("the reason is bounded — it is attacker-influenced", () => {
    const { ledger } = recordingLedger({ throwOnWellFormed: new Error("x".repeat(5000)) });
    const v = validateWellFormed({}, args, ledger);
    expect(v.reason!.length).toBeLessThanOrEqual(513);
  });
});

describe("TTL margin", () => {
  const NOW = 1_700_000_000_000;
  const withIntents = (...ttls: unknown[]): PolicyInspectableTx => ({
    intents: new Map(ttls.map((ttl, i) => [i, { ttl }])) as never,
  });

  test("no intents ⇒ rule skipped, because there is no TTL to expire", () => {
    // A feeless shielded transfer has zero intents. Measured, not assumed.
    expect(checkTtlMargin({}, NOW, 60_000).valid).toBe(true);
    expect(checkTtlMargin({ intents: new Map() }, NOW, 60_000).valid).toBe(true);
  });

  test("ample remaining time passes", () => {
    expect(checkTtlMargin(withIntents(new Date(NOW + 300_000)), NOW, 60_000).valid).toBe(true);
  });

  test("REGRESSION: too little remaining time is refused BEFORE any dust is spent", () => {
    const v = checkTtlMargin(withIntents(new Date(NOW + 10_000)), NOW, 60_000);
    expect(v.valid).toBe(false);
    expect(v.errorCode).toBe("TTL_TOO_SHORT");
    expect(v.reason).toContain("60000ms");
  });

  test("already expired is refused", () => {
    expect(checkTtlMargin(withIntents(new Date(NOW - 1)), NOW, 0).valid).toBe(false);
  });

  test("ANY intent being too short refuses the whole transaction", () => {
    const v = checkTtlMargin(
      withIntents(new Date(NOW + 300_000), new Date(NOW + 1_000)),
      NOW,
      60_000,
    );
    expect(v.valid).toBe(false);
  });

  test("an unreadable TTL fails CLOSED, it is not treated as absent", () => {
    for (const bad of [undefined, null, "soon", Number.NaN]) {
      const v = checkTtlMargin(withIntents(bad), NOW, 60_000);
      expect(v.valid).toBe(false);
      expect(v.errorCode).toBe("TTL_UNREADABLE");
    }
  });

  test("epoch-ms and bigint TTLs are both understood", () => {
    expect(checkTtlMargin(withIntents(NOW + 300_000), NOW, 60_000).valid).toBe(true);
    expect(checkTtlMargin(withIntents(BigInt(NOW + 300_000)), NOW, 60_000).valid).toBe(true);
  });
});
