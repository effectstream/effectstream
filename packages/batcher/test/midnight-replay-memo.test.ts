// `getReplayKey` must be cheap, because it is called on the accept path for
// every input, immediately after `validateInput` deserialized that same
// payload. Re-deserializing to answer would double the cost of the single most
// expensive thing intake does — so the answer is memoized at validation time
// and this file pins that it really is reused.
//
// The adapter is driven through its prototype (the pattern `pre-spend-gate`
// already uses): constructing a real one needs wallet seeds, an indexer and a
// worker pool, none of which this behaviour touches.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { MidnightBalancingAdapter } from "../adapters/midnight-balancing-adapter.ts";
import { midnightReplayKey } from "../adapters/midnight-replay-key.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const input = (payload: string): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: payload,
  timestamp: "1754350000000",
  target: "midnight",
});

/** A transaction stand-in that reports the identifiers it was built with. */
const txFor = (...identifiers: string[]) => ({
  tx: { identifiers: () => identifiers },
  txStage: "unbound",
});

interface Probe {
  adapter: MidnightBalancingAdapter;
  memo: Map<string, string | undefined>;
  /** How many times the adapter had to deserialize to answer. */
  deserializations: () => number;
}

function probe(
  deserialize: (input: DefaultBatcherInput) => unknown = (i) =>
    txFor(`id-for-${i.input}`),
): Probe {
  const adapter = Object.create(
    MidnightBalancingAdapter.prototype,
  ) as MidnightBalancingAdapter;
  const memo = new Map<string, string | undefined>();
  let calls = 0;
  Object.assign(adapter as unknown as Record<string, unknown>, {
    replayKeyMemo: memo,
    deserializeTxEntry: (i: DefaultBatcherInput) => {
      calls += 1;
      return deserialize(i);
    },
  });
  return { adapter, memo, deserializations: () => calls };
}

const memoKeyFor = (payload: string) =>
  createHash("sha256").update(payload, "utf8").digest("hex");

describe("the replay-key memo", () => {
  test("a memoized key is returned without deserializing anything", async () => {
    const p = probe();
    const payload = "deadbeef";
    // What `validateInput` leaves behind after it has deserialized.
    p.memo.set(memoKeyFor(payload), "precomputed-key");

    expect(p.adapter.getReplayKey(input(payload))).toBe("precomputed-key");
    // The whole point: the accept path pays nothing for the second answer.
    expect(p.deserializations()).toBe(0);
  });

  test("a memoized ABSENCE is remembered too, not retried forever", async () => {
    const p = probe();
    const payload = "deadbeef";
    p.memo.set(memoKeyFor(payload), undefined);

    expect(p.adapter.getReplayKey(input(payload))).toBeUndefined();
    expect(p.deserializations()).toBe(0);
  });

  test("a miss derives the key once and remembers it", async () => {
    const p = probe();
    const payload = "cafebabe";

    const first = p.adapter.getReplayKey(input(payload));

    expect(first).toBe(midnightReplayKey({ identifiers: () => [`id-for-${payload}`] }));
    expect(p.deserializations()).toBe(1);
    // Second ask is free — otherwise a memo that only fills on the validate
    // path would silently never fill for inputs that arrive another way.
    expect(p.adapter.getReplayKey(input(payload))).toBe(first);
    expect(p.deserializations()).toBe(1);
  });

  test("the memo is keyed by payload CONTENT, not by identity", async () => {
    const p = probe();
    p.adapter.getReplayKey(input("same-bytes"));
    // A different DefaultBatcherInput object carrying the same transaction is
    // the same spend; it must hit.
    p.adapter.getReplayKey({ ...input("same-bytes"), address: "addr-2" });
    expect(p.deserializations()).toBe(1);
  });

  test("distinct payloads do not share an answer", async () => {
    const p = probe();
    const a = p.adapter.getReplayKey(input("payload-a"));
    const b = p.adapter.getReplayKey(input("payload-b"));
    expect(a).not.toBe(b);
    expect(p.deserializations()).toBe(2);
  });

  test("an undeserializable payload yields no key instead of throwing", async () => {
    const p = probe(() => {
      throw new Error("not a transaction");
    });

    // Such an input is refused at intake; one that reaches here must not turn
    // the accept path into a 500 over a missing dedup key.
    expect(p.adapter.getReplayKey(input("garbage"))).toBeUndefined();
  });

  test("the memo stays bounded under sustained traffic", async () => {
    const p = probe();
    for (let i = 0; i < 1_200; i += 1) {
      p.adapter.getReplayKey(input(`payload-${i}`));
    }
    // A memo that grows with traffic is a leak; each entry pins two hex
    // strings, and nothing ever removes them otherwise.
    expect(p.memo.size).toBeLessThanOrEqual(1_024);
    // Eviction is oldest-first, so the newest answer is still there…
    expect(p.memo.has(memoKeyFor("payload-1199"))).toBe(true);
    // …and the oldest is the one that went.
    expect(p.memo.has(memoKeyFor("payload-0"))).toBe(false);
  });
});
