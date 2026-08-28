import { describe, expect, test } from "bun:test";
import type { StateValue } from "@effectstream/config";
import { MidnightGenericPrimitive } from "./midnight-genetic.ts";

function cell(...bytes: number[]): StateValue {
  return {
    type: () => "cell",
    asCell: () => ({ value: [Uint8Array.from(bytes)] }),
  } as unknown as StateValue;
}

function array(...values: StateValue[]): StateValue {
  return {
    type: () => "array",
    asArray: () => values,
  } as unknown as StateValue;
}

function nullValue(): StateValue {
  return { type: () => "null" } as unknown as StateValue;
}

function map(entries: [number[], StateValue][]): StateValue {
  const value = new Map(
    entries.map(([key, item]) => [
      { value: [Uint8Array.from(key)] },
      item,
    ]),
  );
  return {
    type: () => "map",
    asMap: () => value,
  } as unknown as StateValue;
}

function primitive(name: string, ledgerSchema?: Record<string, any>) {
  return new MidnightGenericPrimitive({
    instanceName: name,
    startBlockHeight: 1,
    contractAddress: "0".repeat(64) as any,
    stateMachinePrefix: name,
    ledgerSchema,
  });
}

describe("MidnightGenericPrimitive ledger schema", () => {
  test("decodes simple, optional, and map fields in declaration order", () => {
    const decoder = primitive("schema-values", {
      round: "uint128",
      bytes: "bytes",
      enabled: "boolean",
      missing: { type: "option", value: "uint64" },
      entries: { type: "map", value: "uint16" },
    });

    expect(decoder.parseAdditionalLedgerFields(array(
      cell(0x01, 0x02),
      cell(0xab, 0xcd),
      cell(0x01),
      nullValue(),
      map([[[0x0a], cell(0x03)]]),
    ))).toEqual({
      round: "513",
      bytes: "0xabcd",
      enabled: true,
      missing: null,
      entries: { "0x0a": "3" },
    });
  });

  test("a shorter schema decodes the leading declaration-order prefix", () => {
    const decoder = primitive("schema-prefix", { round: "uint128" });

    expect(decoder.parseAdditionalLedgerFields(array(
      cell(0x07),
      cell(0xaa, 0xbb),
      cell(0x01),
    ))).toEqual({ round: "7" });
  });

  test("requires either generated contract code or a non-empty schema", () => {
    expect(() => primitive("missing-decoder")).toThrow(/requires either/);
    expect(() => primitive("empty-schema", {})).toThrow(/empty ledger schema/);
  });

  test("reports declaration-order and field-type mismatches", () => {
    const decoder = primitive("schema-order", {
      entries: { type: "map", value: "uint16" },
      round: "uint128",
    });
    expect(() => decoder.parseAdditionalLedgerFields(array(
      cell(0x01),
      map([]),
    ))).toThrow(/field "entries" expects a map/);
  });

  test("rejects an incompatible ledger root", () => {
    const decoder = primitive("schema-root", { round: "uint128" });
    expect(() => decoder.parseAdditionalLedgerFields(cell(0x01))).toThrow(
      /Ledger root must be an array/,
    );
  });
});
