import { hexStringToUint8Array } from "@paima/utils";
import type { DefaultBatcherInput } from "../core/types.ts";

const BATCH_PREFIX = "&B";

export interface MidnightBatchPayload {
  prefix: string;
  payloads: Array<{
    circuit: string;
    args: unknown[];
    addressType: number;
    address: string;
    signature: string;
    timestamp: string;
  }>;
}

function decodeHexIfNeeded(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Midnight batch builder expects string input payloads");
  }

  if (/^0x[0-9a-fA-F]+$/.test(value)) {
    const normalized = value.slice(2);
    return new TextDecoder().decode(hexStringToUint8Array(normalized));
  }

  if (/^[0-9a-fA-F]+$/.test(value)) {
    return new TextDecoder().decode(hexStringToUint8Array(value));
  }

  return value;
}

export class MidnightBatchBuilderLogic {
  buildBatchData<T extends DefaultBatcherInput>(
    inputs: T[],
    options?: {
      /** Maximum size of the batch in bytes */
      maxSize?: number;
    },
  ): { selectedInputs: T[]; data: MidnightBatchPayload | null } | null {
    if (inputs.length === 0) return null;

    const maxSize = options?.maxSize ?? 10000;
    const selectedInputs: T[] = [];
    const payloads: Array<{
      circuit: string;
      args: unknown[];
      addressType: number;
      address: string;
      signature: string;
      timestamp: string;
    }> = [];

    const encoder = new TextEncoder();
    const emptyBatch = JSON.stringify({ prefix: BATCH_PREFIX, payloads: [] });
    let currentSize = encoder.encode(emptyBatch).length;

    for (const input of inputs) {
      // Inputs are now pre-validated, so we can trust the structure
      const parsed = JSON.parse(decodeHexIfNeeded(input.input));

      const payloadEntry = {
        circuit: parsed.circuit,
        args: parsed.args,
        addressType: input.addressType,
        address: input.address,
        signature: input.signature ?? "",
        timestamp: input.timestamp,
      };

      const entrySize = encoder.encode(JSON.stringify(payloadEntry)).length;

      if (currentSize + entrySize > maxSize) {
        break;
      }

      selectedInputs.push(input);
      payloads.push(payloadEntry);
      currentSize += entrySize;
    }

    if (payloads.length === 0) {
      return { selectedInputs: [], data: null };
    }

    return {
      selectedInputs,
      data: {
        prefix: BATCH_PREFIX,
        payloads,
      },
    };
  }
}
