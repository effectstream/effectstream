import { AddressType } from "@effectstream/utils";
import { test, expect } from "bun:test";
import { EvmBatchBuilderLogic } from "./evm-builder-logic.ts";

function makeInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    addressType: AddressType.EVM,
    address: "0xabc",
    signature: "0xsig",
    timestamp: "1700000000000",
    input: JSON.stringify({
      method: "incrementCounter",
      args: [],
    }),
    ...overrides,
  };
}

test("EvmBatchBuilderLogic - returns null for empty inputs", () => {
  const builder = new EvmBatchBuilderLogic();
  const result = builder.buildBatchData([], { maxSize: 1000 });
  expect(result).toEqual(null);
});

test("EvmBatchBuilderLogic - batches valid input", () => {
  const builder = new EvmBatchBuilderLogic();
  const input = makeInput();
  const result = builder.buildBatchData([input], { maxSize: 1000 });

  expect(result?.selectedInputs.length).toEqual(1);
  expect(result?.selectedInputs[0]).toEqual(input);
  expect(result?.data?.prefix).toEqual("&B");
  expect(result?.data?.payloads.length).toEqual(1);
  expect(result?.data?.payloads[0].method).toEqual("incrementCounter");
  expect(result?.data?.payloads[0].address).toEqual(input.address);
});

test("EvmBatchBuilderLogic - skips malformed payloads", () => {
  const builder = new EvmBatchBuilderLogic();
  const badInput = makeInput({ input: "not-json" });
  const goodInput = makeInput({
    input: JSON.stringify({ method: "setValue", args: [1] }),
  });

  const result = builder.buildBatchData([badInput, goodInput], { maxSize: 1000 });
  expect(result?.selectedInputs.length).toEqual(1);
  expect(result?.selectedInputs[0]).toEqual(goodInput);
  expect(result?.data?.payloads.length).toEqual(1);
  expect(result?.data?.payloads[0].method).toEqual("setValue");
});

test("EvmBatchBuilderLogic - enforces max size", () => {
  const builder = new EvmBatchBuilderLogic();
  const input = makeInput();
  const result = builder.buildBatchData([input], { maxSize: 10 });
  expect(result).toEqual({ selectedInputs: [], data: null });
});

test("EvmBatchBuilderLogic - supports hex encoded payloads", () => {
  const builder = new EvmBatchBuilderLogic();
  const json = JSON.stringify({ method: "hexCall", args: ["0x1"] });
  const hexInput = makeInput({
    input: `0x${new TextEncoder().encode(json).reduce(
      (acc, byte) => acc + byte.toString(16).padStart(2, "0"),
      "",
    )}`,
  });

  const result = builder.buildBatchData([hexInput], { maxSize: 1000 });
  expect(result?.data?.payloads[0].method).toEqual("hexCall");
});
