// Request identity: the serialization and the id derived from it.
//
// This is the feature's cornerstone — every later phase (status records, dedup,
// the poll endpoint) keys off `requestId`, so a drift here is a drift in every
// answer the batcher gives about a request. The cases below pin three things:
//
//  1. STABILITY — the same request always hashes to the same id, across calls
//     and across processes, because a client must be able to recompute it.
//  2. SENSITIVITY — every field of the content key changes the id. A field that
//     did not would let two different requests share one status record.
//  3. ONE SERIALIZATION — the exact key string is locked, because three call
//     sites (`FileStorage` row identity, `DatabaseStorage` row identity, the
//     `Batcher`'s receipt-callback key) now derive from this function and must
//     stay byte-identical to what they built before.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  buildRequestKey,
  computeRequestId,
  requestIdFromKey,
} from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: "1754350000000",
  signature: "sig-1",
  ...overrides,
});

describe("content key", () => {
  test("is exactly addressType|target|address|timestamp|signature|input", async () => {
    // Locked deliberately as a literal: this string IS the identity the queue
    // rows and the receipt callbacks were already built from before this
    // function existed. Changing it silently orphans every row in a live queue.
    expect(buildRequestKey(input({ target: "product-a" }), "ignored")).toBe(
      `5|product-a|addr-1|1754350000000|sig-1|${JSON.stringify({ tx: "aa".repeat(8) })}`,
    );
  });

  test("an input without a target takes the fallback", async () => {
    expect(buildRequestKey(input(), "product-a")).toBe(
      `5|product-a|addr-1|1754350000000|sig-1|${JSON.stringify({ tx: "aa".repeat(8) })}`,
    );
  });

  test("an input WITH a target ignores the fallback", async () => {
    // The fallback is a legacy accommodation, not an override: a stamped row
    // must not take on the identity of whichever product happens to read it.
    expect(buildRequestKey(input({ target: "product-b" }), "product-a")).toBe(
      buildRequestKey(input({ target: "product-b" }), "product-b"),
    );
  });

  test("a missing signature is the empty field, not the string 'undefined'", async () => {
    expect(buildRequestKey(input({ signature: undefined }), "product-a")).toBe(
      `5|product-a|addr-1|1754350000000||${JSON.stringify({ tx: "aa".repeat(8) })}`,
    );
  });
});

describe("requestId", () => {
  test("is the hex sha256 of the content key", async () => {
    const key = buildRequestKey(input(), "product-a");
    const expected = createHash("sha256").update(key, "utf8").digest("hex");

    expect(computeRequestId(input(), "product-a")).toBe(expected);
    expect(requestIdFromKey(key)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the same request hashes to the same id every time", async () => {
    const first = computeRequestId(input(), "product-a");
    const second = computeRequestId(input(), "product-a");
    // A fresh object with the same values — identity is by content, not by
    // reference, because the id has to be recomputable by a client.
    const third = computeRequestId({ ...input() }, "product-a");

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  test("every field of the key changes the id", async () => {
    const base = computeRequestId(input(), "product-a");
    const variants: Record<string, string> = {
      addressType: computeRequestId(input({ addressType: 6 }), "product-a"),
      address: computeRequestId(input({ address: "addr-2" }), "product-a"),
      timestamp: computeRequestId(input({ timestamp: "1754350000001" }), "product-a"),
      signature: computeRequestId(input({ signature: "sig-2" }), "product-a"),
      input: computeRequestId(input({ input: "something-else" }), "product-a"),
      target: computeRequestId(input(), "product-b"),
    };

    for (const [field, id] of Object.entries(variants)) {
      expect(`${field}:${id}`).not.toBe(`${field}:${base}`);
    }
    // …and they are all distinct from each other, not just from the base.
    expect(new Set(Object.values(variants)).size).toBe(
      Object.keys(variants).length,
    );
  });

  test("the same payload to two targets is two different requests", async () => {
    // Spec User Story 4.2: target is part of identity. If it were not, one
    // product's confirmation would report as the other product's confirmation.
    const explicitA = computeRequestId(input({ target: "product-a" }), "product-a");
    const explicitB = computeRequestId(input({ target: "product-b" }), "product-b");

    expect(explicitA).not.toBe(explicitB);
  });

  test("an empty field still occupies its slot in the key", async () => {
    // A serialization that dropped empty fields would let an input with no
    // signature collide with a different input whose fields shift left by one.
    expect(computeRequestId(input({ signature: "" }), "product-a"))
      .not.toBe(computeRequestId(input({ signature: undefined, timestamp: "" }), "product-a"));
  });
});
