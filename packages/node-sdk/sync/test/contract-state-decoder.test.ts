import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { ContractState } from "@midnight-ntwrk/onchain-runtime";

import {
  ContractStateDecodeError,
  decodeContractState,
} from "../src/sync-protocols/midnight/contract-state-decoder.ts";

function expectDecodeFailure(raw: string): void {
  try {
    decodeContractState(raw);
    throw new Error("expected decodeContractState to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(ContractStateDecodeError);
    expect((error as ContractStateDecodeError).rawHex).toBe(raw);
    expect(String(error)).toContain("onchain-runtime-v4");
  }
}

describe("decodeContractState", () => {
  test("round-trips a valid generic contract state", () => {
    const raw = Buffer.from(new ContractState().serialize()).toString("hex");
    expect(decodeContractState(raw)).toBeInstanceOf(ContractState);
  });

  test("rejects non-hex semantic bytes, invalid suffixes, and odd length", () => {
    const raw = Buffer.from(new ContractState().serialize()).toString("hex");
    const semanticOffset = 48 * 2;
    expect(raw.length).toBeGreaterThan(semanticOffset + 2);
    const semanticByte = `${raw.slice(0, semanticOffset)}zz${
      raw.slice(semanticOffset + 2)
    }`;

    for (const malformed of [semanticByte, `${raw}zz`, `${raw}0`]) {
      expectDecodeFailure(malformed);
    }
  });
});
