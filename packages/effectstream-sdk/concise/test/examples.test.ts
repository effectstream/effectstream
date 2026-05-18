// Examples for the README.

import { test, expect } from "bun:test";
import { Type } from "@sinclair/typebox";
import { AddressType, type TimestampMsStr, type WalletAddress } from "@effectstream/utils";
import {
  createBatcherSubunit,
  createMessageForBatcher,
  generateStmInput,
  hashBatchSubunit,
  parseStmInput,
  toKeyedJsonGrammar,
} from "../src/mod.ts";

test("README: createMessageForBatcher produces a canonical signable string", () => {
  const message = createMessageForBatcher(
    null,
    "1715731200000" as TimestampMsStr,
    "0x1234567890123456789012345678901234567890" as WalletAddress,
    AddressType.EVM,
    "join|alice",
  );

  expect(typeof message).toBe("string");
  // Sanitised to lower-case alphanumerics + dashes
  expect(message).toMatch(/^[a-z0-9-]+$/);
});

test("README: createBatcherSubunit + hashBatchSubunit hash an EVM input", () => {
  const subunit = createBatcherSubunit(
    "1715731200000" as TimestampMsStr,
    "0x1234567890123456789012345678901234567890" as WalletAddress,
    AddressType.EVM,
    "0xsignature" as any,
    "join|alice",
  );
  expect(subunit.addressType).toBe(AddressType.EVM);

  const hash = hashBatchSubunit(subunit);
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
});

test("README: define a grammar, generate, and round-trip it back", () => {
  const grammar = {
    join: [["user", Type.String()]] as const,
    leave: [["user", Type.String()]] as const,
  } as const;
  const keyed = toKeyedJsonGrammar(grammar);

  const tuple = generateStmInput(grammar, "join", { user: "alice" });
  expect(tuple).toEqual(["join", "alice"] as any);

  const parsed = parseStmInput(JSON.stringify(tuple), grammar, keyed);
  expect(parsed.prefix).toBe("join");
  expect(parsed.data).toEqual({ user: "alice" });
});
