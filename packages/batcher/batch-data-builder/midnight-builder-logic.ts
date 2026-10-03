import { hexStringToUint8Array } from "@effectstream/utils";
import type { DefaultBatcherInput } from "../core/types.ts";

const BATCH_PREFIX = "&B";

/**
 * Coin public key → encryption public key pairs, each 32 bytes as lowercase
 * hex without `0x`. A circuit that mints a shielded coin to a third-party
 * wallet (`ZswapCoinPublicKey` recipient) needs the recipient's encryption
 * key to build the output; midnight-js only knows the submitting wallet's own.
 * Decode the pair from a shielded address with `parseShieldedAddress`
 * (`@effectstream/midnight-contracts/shielded-address`).
 */
export type CoinEncPublicKeyMappings = Array<[string, string]>;

const KEY_HEX = /^[0-9a-f]{64}$/;

/**
 * Validate an input's optional `coinEncPublicKeyMappings`. Returns an error
 * message, or `null` when the value is absent or valid.
 */
export function validateCoinEncPublicKeyMappings(value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    return "coinEncPublicKeyMappings must be an array of [coinPublicKeyHex, encryptionPublicKeyHex] pairs";
  }
  const seen = new Map<string, string>();
  for (let i = 0; i < value.length; i++) {
    const pair = value[i];
    if (!Array.isArray(pair) || pair.length !== 2) {
      return `coinEncPublicKeyMappings[${i}] must be a [coinPublicKeyHex, encryptionPublicKeyHex] pair`;
    }
    const [cpk, epk] = pair;
    if (typeof cpk !== "string" || !KEY_HEX.test(cpk)) {
      return `coinEncPublicKeyMappings[${i}][0] must be a 32-byte coin public key as 64 lowercase hex characters without 0x`;
    }
    if (typeof epk !== "string" || !KEY_HEX.test(epk)) {
      return `coinEncPublicKeyMappings[${i}][1] must be a 32-byte encryption public key as 64 lowercase hex characters without 0x`;
    }
    const previous = seen.get(cpk);
    if (previous !== undefined && previous !== epk) {
      return `coinEncPublicKeyMappings maps coin public key ${cpk} to two different encryption keys`;
    }
    seen.set(cpk, epk);
  }
  return null;
}

export interface MidnightBatchPayload {
  prefix: string;
  payloads: Array<{
    circuit: string;
    args: unknown[];
    addressType: number;
    address: string;
    signature: string;
    timestamp: string;
    /** Present only when the input carried a non-empty mapping list. */
    coinEncPublicKeyMappings?: CoinEncPublicKeyMappings;
  }>;
  /** Snapshot of reserved input keys for in-flight tracking.
   *  Set by the adapter's buildBatchData, cleared by releaseBatchResources. */
  reservedInputKeys?: string[];
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
    const payloads: MidnightBatchPayload["payloads"] = [];

    const encoder = new TextEncoder();
    const emptyBatch = JSON.stringify({ prefix: BATCH_PREFIX, payloads: [] });
    let currentSize = encoder.encode(emptyBatch).length;

    for (const input of inputs) {
      // Inputs are now pre-validated, so we can trust the structure
      const parsed = JSON.parse(decodeHexIfNeeded(input.input));

      const payloadEntry: MidnightBatchPayload["payloads"][number] = {
        circuit: parsed.circuit,
        args: parsed.args,
        addressType: input.addressType,
        address: input.address,
        signature: input.signature ?? "",
        timestamp: input.timestamp,
      };
      // Inputs without mappings keep exactly the historical payload shape.
      if (
        Array.isArray(parsed.coinEncPublicKeyMappings) &&
        parsed.coinEncPublicKeyMappings.length > 0
      ) {
        payloadEntry.coinEncPublicKeyMappings = parsed.coinEncPublicKeyMappings;
      }

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
