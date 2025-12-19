import { AddressType } from "@effectstream/utils";
import { assertEquals } from "jsr:@std/assert";
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

Deno.test("EvmBatchBuilderLogic - returns null for empty inputs", () => {
  const builder = new EvmBatchBuilderLogic();
  const result = builder.buildBatchData([], { maxSize: 1000 });
  assertEquals(result, null);
});

Deno.test("EvmBatchBuilderLogic - batches valid input", () => {
  const builder = new EvmBatchBuilderLogic();
  const input = makeInput();
  const result = builder.buildBatchData([input], { maxSize: 1000 });

  assertEquals(result?.selectedInputs.length, 1);
  assertEquals(result?.selectedInputs[0], input);
  assertEquals(result?.data?.prefix, "&B");
  assertEquals(result?.data?.payloads.length, 1);
  assertEquals(result?.data?.payloads[0].method, "incrementCounter");
  assertEquals(result?.data?.payloads[0].address, input.address);
});

Deno.test("EvmBatchBuilderLogic - skips malformed payloads", () => {
  const builder = new EvmBatchBuilderLogic();
  const badInput = makeInput({ input: "not-json" });
  const goodInput = makeInput({
    input: JSON.stringify({ method: "setValue", args: [1] }),
  });

  const result = builder.buildBatchData([badInput, goodInput], { maxSize: 1000 });
  assertEquals(result?.selectedInputs.length, 1);
  assertEquals(result?.selectedInputs[0], goodInput);
  assertEquals(result?.data?.payloads.length, 1);
  assertEquals(result?.data?.payloads[0].method, "setValue");
});

Deno.test("EvmBatchBuilderLogic - enforces max size", () => {
  const builder = new EvmBatchBuilderLogic();
  const input = makeInput();
  const result = builder.buildBatchData([input], { maxSize: 10 });
  assertEquals(result, { selectedInputs: [], data: null });
});

Deno.test("EvmBatchBuilderLogic - supports hex encoded payloads", () => {
  const builder = new EvmBatchBuilderLogic();
  const json = JSON.stringify({ method: "hexCall", args: ["0x1"] });
  const hexInput = makeInput({
    input: `0x${new TextEncoder().encode(json).reduce(
      (acc, byte) => acc + byte.toString(16).padStart(2, "0"),
      "",
    )}`,
  });

  const result = builder.buildBatchData([hexInput], { maxSize: 1000 });
  assertEquals(result?.data?.payloads[0].method, "hexCall");
});

