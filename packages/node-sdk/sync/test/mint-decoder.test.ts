import { describe, expect, test } from "bun:test";

import {
  decodeTokenMints,
  MintTransactionDecodeError,
} from "../src/sync-protocols/midnight/mint-decoder.ts";

describe("decodeTokenMints — result and failure semantics", () => {
  test("no transactionResult (system tx) → []", () => {
    expect(decodeTokenMints("deadbeef", undefined)).toEqual([]);
    expect(decodeTokenMints("deadbeef", null)).toEqual([]);
  });

  test("status FAILURE → [] (everything rolled back, incl. guaranteed)", () => {
    expect(
      decodeTokenMints("deadbeef", { status: "FAILURE", segments: [] }),
    ).toEqual([]);
  });

  test("garbage bytes with SUCCESS status fail explicitly", () => {
    for (const raw of ["not-even-hex", "00".repeat(64)]) {
      try {
        decodeTokenMints(raw, { status: "SUCCESS" });
        throw new Error("expected decodeTokenMints to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MintTransactionDecodeError);
        expect((error as MintTransactionDecodeError).rawHex).toBe(raw);
        expect(String(error)).toContain("ledger-v9");
        expect(String(error)).toContain("protocolVersion 2000000");
      }
    }
  });
});
