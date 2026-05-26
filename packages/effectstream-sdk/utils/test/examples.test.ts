// Examples copied verbatim from README.md. If you change one, change both.

import { test, expect } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  AddressType,
  AddressValidator,
  binarySearch,
  TypeboxHelpers,
} from "../src/mod.ts";

test("README: validate an EVM address with AddressValidator", () => {
  const addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const isEvm = Value.Check(AddressValidator[AddressType.EVM], addr);
  expect(isEvm).toBe(true);
});

test("README: an EVM address is rejected by the Cardano validator", () => {
  const addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const isCardano = Value.Check(AddressValidator[AddressType.CARDANO], addr);
  expect(isCardano).toBe(false);
});

test("README: TypeboxHelpers.Evm.Address matches the same schema", () => {
  const addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  expect(Value.Check(TypeboxHelpers.Evm.Address, addr)).toBe(true);
});

test("README: binarySearch finds the left-most index >= target", () => {
  const arr = [1, 3, 5, 7, 9];
  expect(binarySearch(arr, 5, (v) => v)).toBe(2);
  expect(binarySearch(arr, 6, (v) => v)).toBe(3);
});
