import { assertEquals, assertThrows } from "jsr:@std/assert";
import { test } from "@effectstream/utils/runtime";
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
  assertEquals(result, null);
});

test("DefaultBatchBuilderLogic - builds batch with single input", () => {
  const builder = new DefaultBatchBuilderLogic();
  const result = builder.buildBatchData([MOCK_INPUT], { maxSize: 1000 });
  
  assertEquals(result?.selectedInputs.length, 1);
  assertEquals(result?.selectedInputs[0], MOCK_INPUT);
  
  const parsedData = JSON.parse(result!.data);
  assertEquals(parsedData[0], "&B");
  assertEquals(parsedData[1].length, 1);
  
  const inner = JSON.parse(parsedData[1][0]);
  assertEquals(inner[0], `${AddressType.EVM}`); // Address Type as string
  assertEquals(inner[1], MOCK_INPUT.address);
  assertEquals(inner[2], MOCK_INPUT.signature);
  assertEquals(inner[3], MOCK_INPUT.input);
  assertEquals(inner[4], MOCK_INPUT.timestamp);
});

test("DefaultBatchBuilderLogic - respects maxSize", () => {
  const builder = new DefaultBatchBuilderLogic();
  // Provide a very small max size that shouldn't fit even one input
  const result = builder.buildBatchData([MOCK_INPUT], { maxSize: 10 });
  
  // Since it can't fit, it should return null (as per implementation logic: if packed.length + 1 > remainingSpace break)
  // And if batchedTransaction.length === 0 return null
  assertEquals(result, null);
});

test("DefaultBatchBuilderLogic - batches multiple inputs if they fit", () => {
    const builder = new DefaultBatchBuilderLogic();
    const result = builder.buildBatchData([MOCK_INPUT, MOCK_INPUT], { maxSize: 1000 });
    
    assertEquals(result?.selectedInputs.length, 2);
    const parsedData = JSON.parse(result!.data);
    assertEquals(parsedData[1].length, 2);
});

