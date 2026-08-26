// The replay key against the REAL ledger bindings.
//
// This is the test class 00011 deliberately skipped. `midnight-replay-key.ts`
// is duck-typed so it — and its unit tests — stay free of the 10 MB WASM blob,
// and that was a good trade right up until the one property the duck cannot
// express turned out to be the one that mattered: a wasm-bindgen method reads
// `this.__wbg_ptr` before it does anything else, so it only works when called
// ON the transaction. Every mock was arrow functions, which do not care. The
// derivation was therefore calling the accessors detached, throwing a TypeError
// into its own fail-open catch, and reporting "no key" for every single real
// Midnight transaction (00020 F-1.10a) — silently disabling double-payment
// protection for the whole balancing adapter.
//
// So one file crosses the boundary for real. It is cheap: the transaction is
// built entirely offline from the ledger's own sampling helpers — no wallet, no
// node, no indexer, no proof server — and it pins the two properties a replay
// key lives or dies on, against the actual object the adapter is handed.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  createShieldedCoinInfo,
  sampleCoinPublicKey,
  sampleEncryptionPublicKey,
  sampleRawTokenType,
  Transaction as LedgerTransaction,
  ZswapOffer,
  ZswapOutput,
} from "@midnight-ntwrk/ledger-v8";

import { MidnightBalancingAdapter } from "../adapters/midnight-balancing-adapter.ts";
import {
  midnightReplayKey,
  type ReplayIdentifiableTx,
} from "../adapters/midnight-replay-key.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

/**
 * A real unproven transaction, built offline.
 *
 * One shielded output to a sampled recipient is the smallest thing the ledger
 * will call a transaction, and it is enough: `identifiers()` is non-empty for
 * it, which is all the derivation asks for. The coin's nonce is sampled, so two
 * calls produce two genuinely different spends — which the "different spends
 * key differently" case below relies on.
 */
function realUnprovenTx() {
  const coin = createShieldedCoinInfo(sampleRawTokenType(), 10n);
  const output = ZswapOutput.new(
    coin,
    0,
    sampleCoinPublicKey(),
    sampleEncryptionPublicKey(),
  );
  return LedgerTransaction.fromParts(
    "undeployed",
    ZswapOffer.fromOutput(output, sampleRawTokenType(), 10n),
  );
}

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("the Midnight replay key against real ledger-v8 bindings", () => {
  test("a real transaction produces a real key", () => {
    const tx = realUnprovenTx();

    // The property the whole gate rests on, stated against the real object:
    // the ledger CAN name this transaction…
    expect(tx.identifiers().length).toBeGreaterThan(0);
    // …and so can we.
    expect(midnightReplayKey(tx as unknown as ReplayIdentifiableTx))
      .toMatch(/^[0-9a-f]{64}$/);
  });

  test("REGRESSION: the accessors are called ON the transaction", () => {
    const tx = realUnprovenTx();

    // This is the bug, in one assertion. Detached — how the derivation used to
    // call it — a wasm-bindgen method cannot find its own pointer.
    const detached = tx.identifiers as () => unknown;
    expect(() => detached()).toThrow(/__wbg_ptr/);
    // Bound, it answers. Any implementation that loses the receiver turns the
    // line above into the fail-open `undefined` that cost the adapter its
    // dedup, and this file is what stops that from happening again.
    expect(midnightReplayKey(tx as unknown as ReplayIdentifiableTx))
      .not.toBeUndefined();
  });

  test("the key survives a serialize / deserialize round trip", () => {
    // The defining property of a REPLAY key: the same spend, re-encoded and
    // arriving again, must key the same — otherwise a resubmission is balanced
    // and paid for twice. `unproven` is the stage the template envelope uses.
    const tx = realUnprovenTx();
    const before = midnightReplayKey(tx as unknown as ReplayIdentifiableTx);

    const round = LedgerTransaction.deserialize(
      "signature",
      "pre-proof",
      "pre-binding",
      tx.serialize(),
    );

    expect(midnightReplayKey(round as unknown as ReplayIdentifiableTx))
      .toBe(before);
    expect(before).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different spends are not confused for one another", () => {
    // A key that collided across distinct transactions would refuse legitimate
    // work, which is a worse failure than paying twice.
    expect(midnightReplayKey(realUnprovenTx() as unknown as ReplayIdentifiableTx))
      .not.toBe(
        midnightReplayKey(realUnprovenTx() as unknown as ReplayIdentifiableTx),
      );
  });

  test("an unproven transaction has no hash to fall back to — and that is fine", () => {
    // Worth pinning, because it says the identifiers path is not merely the
    // PREFERRED route for this shape, it is the ONLY one: `transactionHash()`
    // throws for anything not proven, signed and bound. Losing the receiver
    // therefore cost 100% of dedup rather than degrading it to a weaker key.
    expect(() => realUnprovenTx().transactionHash())
      .toThrow(/proven, signed and bound/);
  });
});

describe("the balancing adapter's replay key over a real envelope", () => {
  /**
   * The adapter driven through its prototype — the pattern `midnight-replay-memo`
   * and `pre-spend-gate` already use. Constructing a real one needs wallet
   * seeds, an indexer and a worker pool; `getReplayKey` and the deserialization
   * it calls touch none of them.
   */
  function adapterProbe() {
    const adapter = Object.create(
      MidnightBalancingAdapter.prototype,
    ) as MidnightBalancingAdapter;
    const memo = new Map<string, string | undefined>();
    Object.assign(adapter as unknown as Record<string, unknown>, {
      replayKeyMemo: memo,
    });
    return { adapter, memo };
  }

  const envelope = (hex: string): DefaultBatcherInput => ({
    addressType: 5,
    address: "addr-1",
    // Exactly the shape the multi-batcher template submits.
    input: JSON.stringify({ tx: hex, txStage: "unproven" }),
    timestamp: "1754350000000",
    target: "product-b",
  });

  test("a real template envelope yields a defined key", () => {
    const { adapter } = adapterProbe();
    const key = adapter.getReplayKey(envelope(toHex(realUnprovenTx().serialize())));

    // 00017's M14 failed because this was `undefined` for every payload the
    // template sent.
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the memo-miss and memo-hit paths agree", () => {
    const { adapter, memo } = adapterProbe();
    const input = envelope(toHex(realUnprovenTx().serialize()));

    // Miss: deserializes and derives.
    const derived = adapter.getReplayKey(input);
    expect(memo.size).toBe(1);
    // Hit: answered from the memo. A memo that disagreed with the derivation
    // would make dedup depend on whether the entry had been evicted.
    expect(adapter.getReplayKey(input)).toBe(derived);
    // And on the path intake actually takes — `validateInput` memoizes, then
    // the batcher asks — the answer is the same one.
    expect(
      memo.get(createHash("sha256").update(input.input, "utf8").digest("hex")),
    ).toBe(derived);
  });

  test("the same spend resubmitted keys identically", () => {
    // The whole reason the key exists: two byte-identical submissions are one
    // paid spend. Distinct adapters so neither answer comes from a memo.
    const hex = toHex(realUnprovenTx().serialize());
    const first = adapterProbe().adapter.getReplayKey(envelope(hex));
    const second = adapterProbe().adapter.getReplayKey(envelope(hex));

    expect(first).toBe(second);
    expect(first).not.toBeUndefined();
  });

  test("two different spends do not", () => {
    const a = adapterProbe().adapter.getReplayKey(
      envelope(toHex(realUnprovenTx().serialize())),
    );
    const b = adapterProbe().adapter.getReplayKey(
      envelope(toHex(realUnprovenTx().serialize())),
    );
    expect(a).not.toBe(b);
  });
});
