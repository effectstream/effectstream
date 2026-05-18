import type { DefaultBatcherInput } from "../core/types.ts";

/**
 * NEAR batch data builder.
 *
 * Packs batcher inputs into a format suitable for a NEAR FunctionCall.
 * The contract is expected to have a method that accepts an array of inputs.
 */

export interface NearBatchItem {
  address: string;
  input: string;
  signature: string;
  timestamp: string;
}

export function buildNearBatchData(
  inputs: DefaultBatcherInput[],
): NearBatchItem[] {
  return inputs.map((input) => ({
    address: input.address,
    input: input.input,
    signature: input.signature ?? "",
    timestamp: input.timestamp,
  }));
}
