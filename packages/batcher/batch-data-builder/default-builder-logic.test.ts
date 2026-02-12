import { test, expect } from "bun:test";
import { DefaultBatchBuilderLogic } from "./default-builder-logic.ts";
import { AddressType } from "@effectstream/utils";

const MOCK_INPUT = {
  addressType: AddressType.EVM,
  address: "0x123",
  signature: "0xabc",
  input: "test-input",
  timestamp: "1234567890",
};

test("DefaultBatchBuilderLogic - returns null for empty inputs", () => {
  const builder = new DefaultBatchBuilderLogic();
  const result = builder.buildBatchData([], { maxSize: 1000 });
  expect(result).toEqual(null);
});

test("DefaultBatchBuilderLogic - builds batch with single input", () => {
  const builder = new DefaultBatchBuilderLogic();
  const result = builder.buildBatchData([MOCK_INPUT], { maxSize: 1000 });

  expect(result?.selectedInputs.length).toEqual(1);
  expect(result?.selectedInputs[0]).toEqual(MOCK_INPUT);

  const parsedData = JSON.parse(result!.data);
  expect(parsedData[0]).toEqual("&B");
  expect(parsedData[1].length).toEqual(1);

  const inner = JSON.parse(parsedData[1][0]);
  expect(inner[0]).toEqual(`${AddressType.EVM}`); // Address Type as string
  expect(inner[1]).toEqual(MOCK_INPUT.address);
  expect(inner[2]).toEqual(MOCK_INPUT.signature);
  expect(inner[3]).toEqual(MOCK_INPUT.input);
  expect(inner[4]).toEqual(MOCK_INPUT.timestamp);
});

test("DefaultBatchBuilderLogic - respects maxSize", () => {
  const builder = new DefaultBatchBuilderLogic();
  // Provide a very small max size that shouldn't fit even one input
  const result = builder.buildBatchData([MOCK_INPUT], { maxSize: 10 });

  // Since it can't fit, it should return null (as per implementation logic: if packed.length + 1 > remainingSpace break)
  // And if batchedTransaction.length === 0 return null
  expect(result).toEqual(null);
});

test("DefaultBatchBuilderLogic - batches multiple inputs if they fit", () => {
    const builder = new DefaultBatchBuilderLogic();
    const result = builder.buildBatchData([MOCK_INPUT, MOCK_INPUT], { maxSize: 1000 });

    expect(result?.selectedInputs.length).toEqual(2);
    const parsedData = JSON.parse(result!.data);
    expect(parsedData[1].length).toEqual(2);
});
