import { describe, expect, test } from "bun:test";

import {
  decodeTokenMints,
  MintTransactionDecodeError,
} from "../src/sync-protocols/midnight/mint-decoder.ts";

const mintFixture = await Bun.file(
  `${import.meta.dir}/fixtures/midnight-rc4/counter-mint-shielded.json`,
).json() as {
  transaction: {
    raw: string;
    transactionResult: { status: "SUCCESS" };
  };
};

function expectDecodeFailure(raw: string): void {
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
      expectDecodeFailure(raw);
    }
  });

  test("rejects non-hex semantic bytes, invalid suffixes, and odd length", () => {
    const raw = mintFixture.transaction.raw;
    const domainSep = "d4".repeat(32);
    const semanticByte = raw.replace(domainSep, `zz${"d4".repeat(31)}`);
    expect(semanticByte).not.toBe(raw);

    for (const malformed of [semanticByte, `${raw}zz`, `${raw}0`]) {
      expectDecodeFailure(malformed);
    }
  });
});
