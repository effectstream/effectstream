import { ContractState } from "@midnight-ntwrk/onchain-runtime";
import { strictHexToBytes } from "./strict-hex.ts";

export class ContractStateDecodeError extends Error {
  override readonly name = "ContractStateDecodeError";

  constructor(
    message: string,
    readonly rawHex: string,
    readonly decodeCause?: unknown,
  ) {
    super(message);
  }
}

/** Decode generic indexer contract state through the strict raw-hex gate. */
export function decodeContractState(rawHex: string): ContractState {
  try {
    return ContractState.deserialize(strictHexToBytes(rawHex));
  } catch (decodeCause) {
    throw new ContractStateDecodeError(
      `onchain-runtime-v4 could not deserialize Midnight contract state: ${
        (decodeCause as Error)?.message ?? String(decodeCause)
      }`,
      rawHex,
      decodeCause,
    );
  }
}
