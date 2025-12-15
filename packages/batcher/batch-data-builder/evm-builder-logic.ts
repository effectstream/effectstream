import { hexStringToUint8Array } from "@effectstream/utils";
import type { DefaultBatcherInput } from "../core/types.ts";

const BATCH_PREFIX = "&B";

export interface EvmBatchPayload {
  prefix: string;
  payloads: Array<{
    method: string;
    args: unknown[];
    value?: string;
    addressType: number;
    address: string;
    signature: string;
    timestamp: string;
  }>;
}

type RawEvmInput = {
  method: unknown;
  args?: unknown;
  value?: unknown;
};

export interface ParsedEvmInput {
  method: string;
  args: unknown[];
  value?: string;
}

function normalizeValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "bigint") return value.toString();
  throw new Error("EVM input value must be string, number, bigint, or omitted");
}

export function decodeHexIfNeeded(value: string): string {
  if (typeof value !== "string") {
    throw new Error("EVM batch builder expects string input payloads");
  }

  if (/^0x[0-9a-fA-F]+$/.test(value)) {
    const normalized = value.slice(2);
    return new TextDecoder().decode(hexStringToUint8Array(normalized));
  }

  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    return new TextDecoder().decode(hexStringToUint8Array(value));
  }

  return value;
}

export function parseEvmBatcherInput(input: DefaultBatcherInput): ParsedEvmInput {
  const decoded = decodeHexIfNeeded(input.input);
  let parsed: RawEvmInput;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    throw new Error(
      `Invalid EVM input JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("EVM input must be a JSON object");
  }

  if (typeof parsed.method !== "string" || parsed.method.length === 0) {
    throw new Error("EVM input must include a method name");
  }

  if (parsed.args !== undefined && !Array.isArray(parsed.args)) {
    throw new Error("EVM input args must be an array");
  }

  const value = normalizeValue(parsed.value);

  return {
    method: parsed.method,
    args: Array.isArray(parsed.args) ? parsed.args : [],
    value,
  };
}

export class EvmBatchBuilderLogic {
  buildBatchData<T extends DefaultBatcherInput>(
    inputs: T[],
    options?: {
      /** Maximum size of the batch in bytes */
      maxSize?: number;
    },
  ): { selectedInputs: T[]; data: EvmBatchPayload | null } | null {
    if (inputs.length === 0) return null;

    const maxSize = options?.maxSize ?? 10000;
    const encoder = new TextEncoder();
    const emptyBatch = JSON.stringify({ prefix: BATCH_PREFIX, payloads: [] });
    let currentSize = encoder.encode(emptyBatch).length;

    const selectedInputs: T[] = [];
    const payloads: EvmBatchPayload["payloads"] = [];

    for (const input of inputs) {
      let payloadEntry;
      try {
        const parsed = parseEvmBatcherInput(input);
        payloadEntry = {
          method: parsed.method,
          args: parsed.args,
          value: parsed.value,
          addressType: input.addressType,
          address: input.address,
          signature: input.signature ?? "",
          timestamp: input.timestamp,
        };
      } catch (error) {
        console.error(
          "[EvmBatchBuilder] Skipping invalid input for address",
          input.address,
          "-",
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }

      const entrySize = encoder.encode(JSON.stringify(payloadEntry)).length;
      if (currentSize + entrySize > maxSize) {
        console.error("[EvmBatchBuilder] Batch size exceeded maxSize", currentSize + entrySize, maxSize);
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

