import { describe, expect, test } from "bun:test";

import { decodeTokenMints } from "../src/sync-protocols/midnight/mint-decoder.ts";

// Tolerance contract: the decoder must never throw — an undecodable or
// inapplicable transaction contributes nothing (the fetcher's per-height
// error path would otherwise wedge the sync loop).
describe("decodeTokenMints — tolerance", () => {
  test("no transactionResult (system tx) → []", () => {
    expect(decodeTokenMints("deadbeef", undefined)).toEqual([]);
    expect(decodeTokenMints("deadbeef", null)).toEqual([]);
  });

  test("status FAILURE → [] (everything rolled back, incl. guaranteed)", () => {
    expect(
      decodeTokenMints("deadbeef", { status: "FAILURE", segments: [] }),
    ).toEqual([]);
  });

  test("garbage bytes with SUCCESS status → [] without throwing", () => {
    expect(
      decodeTokenMints("not-even-hex", { status: "SUCCESS" }),
    ).toEqual([]);
    expect(
      decodeTokenMints("00".repeat(64), { status: "SUCCESS" }),
    ).toEqual([]);
  });
});
