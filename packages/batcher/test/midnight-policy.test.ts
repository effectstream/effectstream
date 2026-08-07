// Policy engine tests — content-based authorization for a multi-product
// balancing batcher. Fixtures are structural stand-ins for ledger
// transactions (the real objects are WASM-backed); the policy code only ever
// touches `intents`, `guaranteedOffer` and `fallibleOffer`, so the same code
// path is exercised for all three delegated stages.

import { describe, expect, test } from "bun:test";

import {
  callsOnlyCircuits,
  callsOnlyContracts,
  contractCalls,
  evaluateDeclarativePolicy,
  evaluatePolicy,
  hasUnobservableShieldedTokens,
  isEmptyPolicy,
  isMatchedDeltaSwap,
  isPolicyEnforced,
  isZswapOnly,
  type MidnightTxPolicy,
  normalizeEntryPoint,
  normalizeHex,
  type PolicyInspectableTx,
  tokenTypesUsed,
  unshieldedTokenDeltas,
  usesOnlyTokenTypes,
  zswapNullifiers,
  zswapOfferShape,
  zswapTokenDeltas,
} from "../adapters/midnight-policy.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const COUNTER = "b50d19bb97311c2c5463309bcd0ba819bcab140c4a25ff01fffe99c07a7f7e79";
const OTHER_CONTRACT = "aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66";
const TOKEN_A = "0000000000000000000000000000000000000000000000000000000000000001";
const TOKEN_B = "0000000000000000000000000000000000000000000000000000000000000002";

const input = (overrides: Partial<DefaultBatcherInput> = {}): DefaultBatcherInput => ({
  address: "test-address",
  addressType: 5,
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: "1754350000000",
  target: "product-a",
  ...overrides,
} as DefaultBatcherInput);

/** Contract-call transaction. `entryPoint` may be bytes (unproven) or string. */
const callTx = (
  calls: { contract: string; entryPoint: string | Uint8Array }[],
): PolicyInspectableTx => ({
  intents: new Map([[
    1,
    { actions: calls.map((c) => ({ address: c.contract, entryPoint: c.entryPoint })) },
  ]]),
});

/** Transfer transaction with shielded deltas (inputs − outputs). */
const zswapTx = (deltas: Record<string, bigint>): PolicyInspectableTx => ({
  guaranteedOffer: { deltas: new Map(Object.entries(deltas)), inputs: [{}], outputs: [{}] },
});

describe("normalization", () => {
  test("hex is lowercased and 0x-stripped", () => {
    expect(normalizeHex("0xAABB")).toBe("aabb");
    expect(normalizeHex("AABB")).toBe("aabb");
  });

  test("entry points decode from UTF-8 bytes and strip NUL padding", () => {
    expect(normalizeEntryPoint(new TextEncoder().encode("increment"))).toBe("increment");
    expect(normalizeEntryPoint("increment")).toBe("increment");
    const padded = new Uint8Array([...new TextEncoder().encode("increment"), 0, 0]);
    expect(normalizeEntryPoint(padded)).toBe("increment");
    expect(normalizeEntryPoint(undefined)).toBe("");
  });
});

describe("introspection", () => {
  test("contractCalls reports calls across intents, deploys excluded", () => {
    const tx: PolicyInspectableTx = {
      intents: new Map([
        [1, { actions: [{ address: COUNTER, entryPoint: "increment" }] }],
        [2, { actions: [{ address: OTHER_CONTRACT }] }], // deploy: no entryPoint
      ]),
    };
    expect(contractCalls(tx)).toEqual([{ contract: COUNTER, entryPoint: "increment" }]);
  });

  test("isZswapOnly distinguishes transfers from contract calls", () => {
    expect(isZswapOnly(zswapTx({ [TOKEN_A]: 5n }))).toBe(true);
    expect(isZswapOnly(callTx([{ contract: COUNTER, entryPoint: "increment" }]))).toBe(false);
    expect(isZswapOnly({})).toBe(false); // empty tx is not a transfer
  });

  test("zswapTokenDeltas sums offers and drops zero entries", () => {
    const tx: PolicyInspectableTx = {
      guaranteedOffer: { deltas: new Map([[TOKEN_A, 5n], [TOKEN_B, -5n]]) },
      fallibleOffer: new Map([[1, { deltas: new Map([[TOKEN_A, -5n]]) }]]),
    };
    const deltas = zswapTokenDeltas(tx);
    expect(deltas.get(TOKEN_A)).toBeUndefined(); // 5 + (−5) = 0 → dropped
    expect(deltas.get(TOKEN_B)).toBe(-5n);
  });

  test("unshielded deltas are inputs − outputs", () => {
    const tx: PolicyInspectableTx = {
      intents: new Map([[1, {
        guaranteedUnshieldedOffer: {
          inputs: [{ type: TOKEN_A, value: 10n }],
          outputs: [{ type: TOKEN_A, value: 4n }],
        },
      }]]),
    };
    expect(unshieldedTokenDeltas(tx).get(TOKEN_A)).toBe(6n);
  });

  test("tokenTypesUsed covers shielded and unshielded", () => {
    const tx: PolicyInspectableTx = {
      guaranteedOffer: { deltas: new Map([[TOKEN_A, 1n]]) },
      intents: new Map([[1, {
        fallibleUnshieldedOffer: { inputs: [{ type: TOKEN_B, value: 1n }], outputs: [] },
      }]]),
    };
    expect([...tokenTypesUsed(tx)].sort()).toEqual([TOKEN_A, TOKEN_B].sort());
  });

  test("allowlist matchers require EVERY action to match", () => {
    const mixed = callTx([
      { contract: COUNTER, entryPoint: "increment" },
      { contract: OTHER_CONTRACT, entryPoint: "increment" },
    ]);
    expect(callsOnlyContracts(mixed, [COUNTER])).toBe(false);
    expect(callsOnlyContracts(mixed, [COUNTER, OTHER_CONTRACT])).toBe(true);
    // no actions at all → not a "call" match
    expect(callsOnlyContracts(zswapTx({ [TOKEN_A]: 1n }), [COUNTER])).toBe(false);
  });

  test("usesOnlyTokenTypes rejects unknown tokens", () => {
    expect(usesOnlyTokenTypes(zswapTx({ [TOKEN_A]: 1n }), [TOKEN_A])).toBe(true);
    expect(usesOnlyTokenTypes(zswapTx({ [TOKEN_B]: 1n }), [TOKEN_A])).toBe(false);
  });
});

describe("allowedContracts authorizes CALLS, not every action", () => {
  // A maintenance update can rotate a contract's verifier keys and its
  // maintenance authority. It is categorically not "a circuit call", but it
  // IS a contract action carrying the contract's address — so an allowlist
  // that matches on address alone authorizes it. The config option is
  // documented as "any circuit on these contract addresses"; an operator
  // reading that would not expect to be sponsoring key rotations.
  //
  // Deploys and maintenance updates both report an empty entry point.
  const maintenanceOn = (contract: string): PolicyInspectableTx => ({
    intents: new Map([[1, { actions: [{ address: contract }] }]]),
  });

  test("REGRESSION: a maintenance update on an allowlisted contract is refused", () => {
    expect(callsOnlyContracts(maintenanceOn(COUNTER), [COUNTER])).toBe(false);
    const verdict = evaluateDeclarativePolicy(maintenanceOn(COUNTER), {
      allowedContracts: [COUNTER],
    });
    expect(verdict.valid).toBe(false);
  });

  test("REGRESSION: an allowed call PLUS a maintenance update is refused", () => {
    const mixed: PolicyInspectableTx = {
      intents: new Map([
        [1, { actions: [{ address: COUNTER, entryPoint: "increment" }] }],
        [2, { actions: [{ address: COUNTER }] }], // maintenance / deploy
      ]),
    };
    expect(callsOnlyContracts(mixed, [COUNTER])).toBe(false);
  });

  test("an ordinary call on an allowlisted contract is still accepted", () => {
    const call = callTx([{ contract: COUNTER, entryPoint: "increment" }]);
    expect(callsOnlyContracts(call, [COUNTER])).toBe(true);
    expect(evaluateDeclarativePolicy(call, { allowedContracts: [COUNTER] }).valid).toBe(true);
  });

  test("an empty entryPoint in an allowedCircuits entry cannot authorize maintenance", () => {
    // Guards the adjacent footgun: allowlisting {contract, entryPoint: ""}
    // would otherwise match a maintenance update's empty entry point.
    expect(
      callsOnlyCircuits(maintenanceOn(COUNTER), [{ contract: COUNTER, entryPoint: "" }]),
    ).toBe(false);
  });
});

describe("declarative policy", () => {
  test("no rules configured is allow-all (back-compat)", () => {
    expect(isEmptyPolicy(undefined)).toBe(true);
    expect(evaluateDeclarativePolicy(callTx([{ contract: OTHER_CONTRACT, entryPoint: "x" }]), undefined))
      .toMatchObject({ valid: true, rule: "allow-all" });
  });

  test("allowZswapTransfers accepts transfers, rejects contract calls", () => {
    const policy = { allowZswapTransfers: true };
    expect(evaluateDeclarativePolicy(zswapTx({ [TOKEN_A]: 1n }), policy).valid).toBe(true);
    const verdict = evaluateDeclarativePolicy(
      callTx([{ contract: COUNTER, entryPoint: "increment" }]),
      policy,
    );
    expect(verdict.valid).toBe(false);
    expect(verdict.rule).toBe("no-rule-matched");
  });

  test("allowedTokenTypes tightens the transfer rule — for UNSHIELDED offers", () => {
    // Shielded coins are exempt from this rule not because they are trusted but
    // because their types cannot be enumerated; those are refused outright, and
    // that case is covered in the observability describe block below.
    const policy = { allowZswapTransfers: true, allowedTokenTypes: [TOKEN_A] };
    const unshielded = (token: string): PolicyInspectableTx => ({
      intents: new Map([[1, {
        guaranteedUnshieldedOffer: {
          inputs: [{ type: token, value: 5n }],
          outputs: [{ type: token, value: 5n }],
        },
      }]]),
    });
    expect(evaluateDeclarativePolicy(unshielded(TOKEN_A), policy).valid).toBe(true);
    const verdict = evaluateDeclarativePolicy(unshielded(TOKEN_B), policy);
    expect(verdict.valid).toBe(false);
    expect(verdict.rule).toBe("allowedTokenTypes");
  });

  test("allowedCircuits requires an exact (contract, entryPoint) match", () => {
    const policy = { allowedCircuits: [{ contract: COUNTER, entryPoint: "increment" }] };
    expect(evaluateDeclarativePolicy(callTx([{ contract: COUNTER, entryPoint: "increment" }]), policy).valid)
      .toBe(true);
    // right contract, wrong circuit
    expect(evaluateDeclarativePolicy(callTx([{ contract: COUNTER, entryPoint: "decrement" }]), policy).valid)
      .toBe(false);
    // case-sensitive entry point
    expect(evaluateDeclarativePolicy(callTx([{ contract: COUNTER, entryPoint: "Increment" }]), policy).valid)
      .toBe(false);
    // right circuit, wrong contract
    expect(evaluateDeclarativePolicy(callTx([{ contract: OTHER_CONTRACT, entryPoint: "increment" }]), policy).valid)
      .toBe(false);
  });

  test("BORDER: an allowed call plus a disallowed call in another intent is rejected", () => {
    const policy = { allowedContracts: [COUNTER] };
    const tx: PolicyInspectableTx = {
      intents: new Map([
        [1, { actions: [{ address: COUNTER, entryPoint: "increment" }] }],
        [2, { actions: [{ address: OTHER_CONTRACT, entryPoint: "increment" }] }],
      ]),
    };
    expect(evaluateDeclarativePolicy(tx, policy).valid).toBe(false);
  });

  test("BORDER: a deploy is not a call and is rejected by circuit allowlists", () => {
    const policy = { allowedCircuits: [{ contract: COUNTER, entryPoint: "increment" }] };
    const deployTx: PolicyInspectableTx = {
      intents: new Map([[1, { actions: [{ address: COUNTER }] }]]),
    };
    expect(evaluateDeclarativePolicy(deployTx, policy).valid).toBe(false);
  });

  test("BORDER: empty transaction matches nothing", () => {
    expect(evaluateDeclarativePolicy({}, { allowZswapTransfers: true }).valid).toBe(false);
  });

  test("BORDER: entryPoint as bytes matches the same rule as a string", () => {
    const policy = { allowedCircuits: [{ contract: COUNTER, entryPoint: "increment" }] };
    const asBytes = callTx([
      { contract: COUNTER, entryPoint: new TextEncoder().encode("increment") },
    ]);
    expect(evaluateDeclarativePolicy(asBytes, policy).valid).toBe(true);
  });

  test("BORDER: introspection failure fails CLOSED", () => {
    const hostile = {
      get intents(): never {
        throw new Error("wasm exploded");
      },
    } as unknown as PolicyInspectableTx;
    const verdict = evaluateDeclarativePolicy(hostile, { allowZswapTransfers: true });
    expect(verdict.valid).toBe(false);
    expect(verdict.rule).toBe("introspection-failed");
  });

  test("rules are a union: either matching rule accepts", () => {
    const policy = {
      allowZswapTransfers: true,
      allowedCircuits: [{ contract: COUNTER, entryPoint: "increment" }],
    };
    expect(evaluateDeclarativePolicy(zswapTx({ [TOKEN_A]: 1n }), policy).valid).toBe(true);
    expect(evaluateDeclarativePolicy(callTx([{ contract: COUNTER, entryPoint: "increment" }]), policy).valid)
      .toBe(true);
  });
});

describe("custom final filter", () => {
  const ctx = (tx: PolicyInspectableTx) => ({
    tx,
    txStage: "finalized" as const,
    input: input(),
  });

  test("runs AFTER the declarative rules and receives their verdict", async () => {
    const seen: string[] = [];
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true,
      allowCustomFinalFilter: ({ declarativeVerdict }) => {
        seen.push(declarativeVerdict.rule ?? "none");
        return true;
      },
    };
    await evaluatePolicy(ctx(zswapTx({ [TOKEN_A]: 1n })), policy);
    expect(seen).toEqual(["allowZswapTransfers"]);
  });

  test("can TIGHTEN: declarative pass → custom reject", async () => {
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true,
      allowCustomFinalFilter: () => ({ valid: false, error: "amount too large" }),
    };
    const verdict = await evaluatePolicy(ctx(zswapTx({ [TOKEN_A]: 1n })), policy);
    expect(verdict.valid).toBe(false);
    expect(verdict.rule).toBe("allowCustomFinalFilter");
    expect(verdict.reason).toBe("amount too large");
  });

  test("can OVERRIDE: declarative reject → custom accept (final by design)", async () => {
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true, // a contract call fails this
      allowCustomFinalFilter: () => true,
    };
    const verdict = await evaluatePolicy(
      ctx(callTx([{ contract: COUNTER, entryPoint: "increment" }])),
      policy,
    );
    expect(verdict.valid).toBe(true);
  });

  test("throwing fails CLOSED", async () => {
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true,
      allowCustomFinalFilter: () => {
        throw new Error("boom");
      },
    };
    const verdict = await evaluatePolicy(ctx(zswapTx({ [TOKEN_A]: 1n })), policy);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toContain("boom");
  });

  test("async filters are awaited", async () => {
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true,
      allowCustomFinalFilter: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return false;
      },
    };
    expect((await evaluatePolicy(ctx(zswapTx({ [TOKEN_A]: 1n })), policy)).valid).toBe(false);
  });

  test("a filter alone (no declarative rules) still gates", async () => {
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowCustomFinalFilter: ({ declarativeVerdict }) => {
        expect(declarativeVerdict.rule).toBe("allow-all");
        return false;
      },
    };
    expect((await evaluatePolicy(ctx(zswapTx({ [TOKEN_A]: 1n })), policy)).valid).toBe(false);
  });
});

describe("matched-delta swaps (product-c shape)", () => {
  test("+X tokenA / −X tokenB is accepted", () => {
    expect(isMatchedDeltaSwap(zswapTx({ [TOKEN_A]: 5n, [TOKEN_B]: -5n }))).toBe(true);
  });

  test("mismatched magnitudes are rejected", () => {
    expect(isMatchedDeltaSwap(zswapTx({ [TOKEN_A]: 5n, [TOKEN_B]: -4n }))).toBe(false);
  });

  test("same-sign deltas are rejected", () => {
    expect(isMatchedDeltaSwap(zswapTx({ [TOKEN_A]: 5n, [TOKEN_B]: 5n }))).toBe(false);
  });

  test("three token deltas are rejected", () => {
    const tx = zswapTx({ [TOKEN_A]: 5n, [TOKEN_B]: -5n, ["03".repeat(32)]: 7n });
    expect(isMatchedDeltaSwap(tx)).toBe(false);
  });

  test("single-token transfer is rejected (not a swap)", () => {
    expect(isMatchedDeltaSwap(zswapTx({ [TOKEN_A]: 5n }))).toBe(false);
  });

  test("zero-value deltas do not count as a swap", () => {
    expect(isMatchedDeltaSwap(zswapTx({ [TOKEN_A]: 0n, [TOKEN_B]: 0n }))).toBe(false);
  });

  test("dust fees do not pollute the delta map (fees live outside zswap offers)", () => {
    // The batcher's balancing adds dust via intent dustActions, never as a
    // zswap offer delta — so a matched swap stays matched after balancing.
    const balanced: PolicyInspectableTx = {
      guaranteedOffer: { deltas: new Map([[TOKEN_A, 5n], [TOKEN_B, -5n]]) },
      intents: new Map([[1, { actions: [] }]]),
    };
    expect(isMatchedDeltaSwap(balanced)).toBe(true);
  });

  test("token pair can be pinned", () => {
    const tx = zswapTx({ [TOKEN_A]: 5n, [TOKEN_B]: -5n });
    expect(isMatchedDeltaSwap(tx, { tokens: [TOKEN_A, TOKEN_B] })).toBe(true);
    expect(isMatchedDeltaSwap(tx, { tokens: [TOKEN_A, "09".repeat(32)] })).toBe(false);
  });
});

describe("offer shape (the signal available when amounts are hidden)", () => {
  const offerWith = (inputs: number, outputs: number): PolicyInspectableTx => ({
    guaranteedOffer: {
      deltas: new Map(),
      inputs: Array.from({ length: inputs }, () => ({})),
      outputs: Array.from({ length: outputs }, () => ({})),
    },
  });

  test("counts inputs and outputs across offers", () => {
    const tx: PolicyInspectableTx = {
      guaranteedOffer: { inputs: [{}], outputs: [{}, {}] },
      fallibleOffer: new Map([[1, { inputs: [{}, {}], outputs: [{}] }]]),
    };
    expect(zswapOfferShape(tx)).toEqual({ inputs: 3, outputs: 3, transients: 0 });
  });

  test("empty transaction has an empty shape", () => {
    expect(zswapOfferShape({})).toEqual({ inputs: 0, outputs: 0, transients: 0 });
  });

  test("a balanced transfer reports NO deltas — structure is all a filter can see", () => {
    // This is why product-c bounds structure: amounts are shielded, and a
    // transfer that neither creates nor destroys value has an empty delta map.
    const balanced = offerWith(1, 2);
    expect(zswapTokenDeltas(balanced).size).toBe(0);
    expect(zswapOfferShape(balanced).outputs).toBe(2);
  });

  test("structural cap accepts a simple payment and refuses a fan-out", async () => {
    const cap = 2;
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true,
      allowCustomFinalFilter: ({ tx, declarativeVerdict }) => {
        if (!declarativeVerdict.valid) return false;
        return zswapOfferShape(tx).outputs <= cap ||
          { valid: false, error: "too many outputs" };
      },
    };
    const ctx = (tx: PolicyInspectableTx) => ({
      tx,
      txStage: "finalized" as const,
      input: input(),
    });
    expect((await evaluatePolicy(ctx(offerWith(1, 2)), policy)).valid).toBe(true);
    const wide = await evaluatePolicy(ctx(offerWith(1, 6)), policy);
    expect(wide.valid).toBe(false);
    expect(wide.reason).toBe("too many outputs");
  });
});

describe("nullifiers (the one thing a sponsor can check about a hidden coin)", () => {
  const withNullifiers = (
    inputs: string[],
    transients: string[] = [],
  ): PolicyInspectableTx => ({
    guaranteedOffer: {
      inputs: inputs.map((n) => ({ nullifier: n })),
      transients: transients.map((n) => ({ nullifier: n })),
    },
  });

  test("collects input and transient nullifiers, normalized and deduped", () => {
    const tx: PolicyInspectableTx = {
      guaranteedOffer: { inputs: [{ nullifier: "0xAABB" }, { nullifier: "aabb" }] },
      fallibleOffer: new Map([[1, { transients: [{ nullifier: "CCDD" }] }]]),
    };
    expect(zswapNullifiers(tx).sort()).toEqual(["aabb", "ccdd"]);
  });

  test("accepts raw bytes as well as hex strings", () => {
    const tx = withNullifiers([]) as PolicyInspectableTx;
    tx.guaranteedOffer!.inputs = [{ nullifier: new Uint8Array([0xde, 0xad, 0x01]) }];
    expect(zswapNullifiers(tx)).toEqual(["dead01"]);
  });

  test("a transfer with no spends reports none", () => {
    expect(zswapNullifiers({})).toEqual([]);
    expect(zswapNullifiers({ guaranteedOffer: { outputs: [{}, {}] } })).toEqual([]);
  });

  test("async filter rejects a tx whose input is already spent", async () => {
    // Stands in for an indexer lookup: a nullifier on chain means the coin is
    // gone, so the transaction can never apply — and a sponsor that submits it
    // anyway pays proving time and dust to learn that.
    const alreadySpent = new Set(["aa11"]);
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true,
      allowCustomFinalFilter: async ({ tx }) => {
        await Promise.resolve();
        const spent = zswapNullifiers(tx).filter((n) => alreadySpent.has(n));
        return spent.length === 0 ||
          { valid: false, error: `input already spent (${spent[0]})` };
      },
    };
    const ctx = (tx: PolicyInspectableTx) => ({
      tx,
      txStage: "finalized" as const,
      input: input(),
    });

    const fresh = await evaluatePolicy(ctx(withNullifiers(["bb22"])), policy);
    expect(fresh.valid).toBe(true);

    const doomed = await evaluatePolicy(ctx(withNullifiers(["aa11"])), policy);
    expect(doomed.valid).toBe(false);
    expect(doomed.reason).toBe("input already spent (aa11)");
  });

  test("the check is monotone — rechecking after a spend only tightens", async () => {
    // Intake and the pre-batch recheck both run this filter. "Spent" never
    // reverts, so a verdict can go accept→reject but never reject→accept.
    const spent = new Set<string>();
    const policy: MidnightTxPolicy<PolicyInspectableTx> = {
      allowZswapTransfers: true,
      allowCustomFinalFilter: ({ tx }) =>
        !zswapNullifiers(tx).some((n) => spent.has(n)),
    };
    const ctx = {
      tx: withNullifiers(["cc33"]),
      txStage: "finalized" as const,
      input: input(),
    };
    expect((await evaluatePolicy(ctx, policy)).valid).toBe(true);
    spent.add("cc33"); // the coin gets spent elsewhere before the batch runs
    expect((await evaluatePolicy(ctx, policy)).valid).toBe(false);
  });
});

describe("enforcement guard (the contract an enforcement point relies on)", () => {
  // Enforcement points that want to skip cheap work when nothing is configured
  // need a guard. The safety contract for ANY such guard is one-directional:
  //
  //   guard says "skip"  ⇒  the policy must be incapable of rejecting.
  //
  // `isEmptyPolicy` does NOT satisfy that contract and was never meant to — it
  // answers a different question (does the DECLARATIVE half have rules?), and
  // a filter-only policy is declaratively empty on purpose so the filter gets
  // an allow-all verdict to override. `isPolicyEnforced` is the guard.

  const filterOnly: MidnightTxPolicy<PolicyInspectableTx> = {
    allowCustomFinalFilter: () => false,
  };

  test("a filter-only policy is declaratively empty — by design", () => {
    expect(isEmptyPolicy(filterOnly as MidnightTxPolicy<never>)).toBe(true);
    expect(
      evaluateDeclarativePolicy(zswapTx({}), filterOnly as MidnightTxPolicy<never>),
    ).toMatchObject({ valid: true, rule: "allow-all" });
  });

  test("a filter-only policy still rejects, so a guard must not skip it", async () => {
    expect(isPolicyEnforced(filterOnly as MidnightTxPolicy<never>)).toBe(true);
    const verdict = await evaluatePolicy(
      { tx: zswapTx({}), txStage: "finalized", input: input() },
      filterOnly,
    );
    expect(verdict.valid).toBe(false);
  });

  test("absent or genuinely empty policies are not enforced", () => {
    expect(isPolicyEnforced(undefined)).toBe(false);
    expect(isPolicyEnforced({} as MidnightTxPolicy<never>)).toBe(false);
  });

  test("CONTRACT: every policy the guard skips is incapable of rejecting", async () => {
    const shapes: MidnightTxPolicy<PolicyInspectableTx>[] = [
      {},
      { allowZswapTransfers: true },
      { allowedContracts: [COUNTER] },
      { allowedCircuits: [{ contract: COUNTER, entryPoint: "increment" }] },
      { allowCustomFinalFilter: () => false },
      { allowZswapTransfers: true, allowCustomFinalFilter: () => false },
      { allowedTokenTypes: [TOKEN_A] },
    ];
    const txs = [
      zswapTx({}),
      zswapTx({ [TOKEN_A]: 1n, [TOKEN_B]: -1n }),
      callTx([{ contract: OTHER_CONTRACT, entryPoint: "drain" }]),
    ];

    let skipped = 0;
    for (const policy of shapes) {
      if (isPolicyEnforced(policy as MidnightTxPolicy<never>)) continue;
      skipped++;
      for (const tx of txs) {
        const verdict = await evaluatePolicy(
          { tx, txStage: "finalized", input: input() },
          policy,
        );
        expect(verdict.valid).toBe(true);
      }
    }
    // §9.5: assert the corpus is non-empty, or "all skipped policies passed"
    // is vacuously true and proves nothing.
    expect(skipped).toBeGreaterThan(0);
  });

  test("isEmptyPolicy violates that contract — why it must not be the guard", async () => {
    // Regression pin. If someone re-guards an enforcement point on
    // isEmptyPolicy, this documents exactly what breaks: the guard skips, and
    // the policy rejects anyway.
    expect(isEmptyPolicy(filterOnly as MidnightTxPolicy<never>)).toBe(true);
    const verdict = await evaluatePolicy(
      { tx: zswapTx({}), txStage: "finalized", input: input() },
      filterOnly,
    );
    expect(verdict.valid).toBe(false);
  });
});

describe("allowedTokenTypes: shielded types are only sometimes observable", () => {
  // Shielded token types are visible ONLY through ZswapOffer.deltas, which is
  // the offer's net imbalance. A balanced transfer — the ordinary case —
  // carries coins but reports no deltas, so the token set is empty and any
  // allowlist checked against it passes vacuously. An UNBALANCED offer (a swap)
  // and unshielded offers do carry their types, so the allowlist is
  // enforceable there. That makes the feature conditionally, not uniformly,
  // blind: testing it with a swap makes it look like it works.

  const balancedTransfer = (): PolicyInspectableTx => ({
    guaranteedOffer: { deltas: new Map(), inputs: [{}], outputs: [{}] },
  });

  test("a balanced shielded transfer exposes no token types at all", () => {
    expect([...tokenTypesUsed(balancedTransfer())]).toEqual([]);
    expect(hasUnobservableShieldedTokens(balancedTransfer())).toBe(true);
  });

  test("REGRESSION: it is REFUSED rather than vacuously accepted", () => {
    const policy = { allowZswapTransfers: true, allowedTokenTypes: [TOKEN_A] };
    const verdict = evaluateDeclarativePolicy(balancedTransfer(), policy);
    expect(verdict.valid).toBe(false);
    expect(verdict.rule).toBe("allowedTokenTypes");
    expect(verdict.reason).toMatch(/not enumerable/);
  });

  test("REGRESSION: a visible delta does NOT make the rest of the offer observable", () => {
    // The bypass an earlier version of this guard allowed. One offer carries:
    //   - a visible, allowlisted, non-zero delta (TOKEN_A), and
    //   - a movement of a FORBIDDEN token that balances within the offer and so
    //     never appears in the delta map at all.
    // The old guard asked "does this offer have ANY observable delta?", saw
    // TOKEN_A, declared the whole offer observable, and checked the allowlist
    // against {TOKEN_A} — so the forbidden token rode along invisibly.
    //
    // Deltas are NET SUMS. They prove some types moved; they can never
    // enumerate every type the coins span.
    const mixed: PolicyInspectableTx = {
      guaranteedOffer: {
        deltas: new Map([[TOKEN_A, 5n]]),
        inputs: [{}, {}],
        outputs: [{}, {}],
      },
    };
    expect(tokenTypesUsed(mixed).has(TOKEN_B)).toBe(false); // invisible, by construction
    expect(hasUnobservableShieldedTokens(mixed)).toBe(true);

    const verdict = evaluateDeclarativePolicy(mixed, {
      allowZswapTransfers: true,
      allowedTokenTypes: [TOKEN_A],
    });
    expect(verdict.valid).toBe(false);
    expect(verdict.rule).toBe("allowedTokenTypes");
  });

  test("an unbalanced swap is no more observable than a balanced transfer", () => {
    // Its deltas name two types, but coins of a third could balance inside it.
    // Enforceable-looking is not enforceable.
    const swap = zswapTx({ [TOKEN_A]: 1n, [TOKEN_B]: -1n });
    expect(hasUnobservableShieldedTokens(swap)).toBe(true);
    expect(
      evaluateDeclarativePolicy(swap, {
        allowZswapTransfers: true,
        allowedTokenTypes: [TOKEN_A, TOKEN_B],
      }).valid,
    ).toBe(false);
  });

  test("unshielded offers carry types directly and stay enforceable", () => {
    const unshielded: PolicyInspectableTx = {
      intents: new Map([[1, {
        guaranteedUnshieldedOffer: {
          inputs: [{ type: TOKEN_B, value: 5n }],
          outputs: [{ type: TOKEN_B, value: 5n }],
        },
      }]]),
    };
    expect(hasUnobservableShieldedTokens(unshielded)).toBe(false);
    expect(
      evaluateDeclarativePolicy(unshielded, {
        allowZswapTransfers: true,
        allowedTokenTypes: [TOKEN_A],
      }).valid,
    ).toBe(false);
  });

  test("without allowedTokenTypes a balanced transfer is still accepted", () => {
    // The observability gate must only apply when an allowlist is configured —
    // otherwise every ordinary transfer would break.
    expect(
      evaluateDeclarativePolicy(balancedTransfer(), { allowZswapTransfers: true }).valid,
    ).toBe(true);
  });
});
