import type {
  AddressAndType,
  AddressType,
  ShallowMergeIntersects,
  Signature,
  TimestampMsStr,
  WalletAddress,
} from "@paima/utils";
import type { InputDataString } from "@paima/chain-types";
import {
  BatcherGrammar,
  BatcherGrammarPrefix,
  BatcherInnerGrammar,
  // BuiltinGrammar,
  // BuiltinGrammarPrefix,
  generateStmInput,
  KeyedBatcherGrammar,
  KeyedBuiltinBatcherInnerGrammar,
  // KeyedBuiltinGrammar,
  parseRawStmInput,
  parseStmInput,
} from "./v2/mod.ts";
import sha3 from "js-sha3";
const { keccak_256 } = sha3;

type ExpandType<T extends AddressAndType> = T extends any ? {
    addressType: T["type"];
    userAddress: T["address"];
  }
  : never;
export type BatchedSubunit = ShallowMergeIntersects<
  ExpandType<AddressAndType> & {
    userSignature: Signature;
    gameInput: InputDataString;
    millisecondTimestamp: TimestampMsStr;
  }
>;

export type BatcherMessage = string;

/** This is what wallets sign when submitting a batch */
export function createMessageForBatcher(
  namespace: string | null,
  millisecondTimestamp: TimestampMsStr,
  walletAddress: WalletAddress,
  inputData: string,
): BatcherMessage {
  return ((namespace ?? "") + millisecondTimestamp + walletAddress + inputData)
    .replace(/[^a-zA-Z0-9]/g, "-")
    .toLocaleLowerCase();
}

/**
 * Hash for the user's message to the batcher
 * Note: no need for namespace, as namespace is already checked before the hash is relevant
 * Note: need user address.
 *       It wasn't needed for the message since that gets signed by the public key
 *       So it contains the address indirectly
 */
export function hashBatchSubunit(input: BatchedSubunit): string {
  return "0x" +
    keccak_256(
      input.userAddress + input.gameInput + input.millisecondTimestamp,
    );
}

/**
 * Adds batches until maxSize is reached, or not batches are left
 * If a batch is empty, empty string is returned (not `B`)
 * The inputs that got selected (taking into account the size limit) are returned
 */
export function buildBatchData(
  maxSize: number,
  inputs: BatchedSubunit[],
): {
  selectedInputs: BatchedSubunit[];
  data: string;
} {
  const selectedInputs: BatchedSubunit[] = [];
  const batchedTransaction: string[] = [];
  let remainingSpace = maxSize -
    `["${BatcherGrammarPrefix.batcherInput}", []`.length;

  for (const input of inputs) {
    const packed = generateStmInput(
      BatcherInnerGrammar,
      `${input.addressType}`,
      input,
    );
    if (packed.length + 1 > remainingSpace) {
      break;
    }

    const packedString = JSON.stringify(packed);
    batchedTransaction.push(packedString);
    remainingSpace -= JSON.stringify(packed).length - '[""]'.length -
      ",".length;
    selectedInputs.push(input);
  }

  // just skip if there is nothing in the batch
  if (batchedTransaction.length === 0) {
    return { selectedInputs, data: "" };
  }

  const batchedData = generateStmInput(
    BatcherGrammar,
    BatcherGrammarPrefix.batcherInput,
    {
      input: batchedTransaction,
    },
  );
  return { selectedInputs, data: JSON.stringify(batchedData) };
}

export type ExtractedBatchSubunit = {
  parsed: BatchedSubunit;
  raw: string;
};
export function extractBatches(inputData: string): ExtractedBatchSubunit[] {
  const parsed = parseStmInput<
    typeof BatcherGrammar,
    typeof BatcherGrammarPrefix.batcherInput
  >(
    inputData,
    BatcherGrammar,
    KeyedBatcherGrammar,
  );
  const result: ExtractedBatchSubunit[] = [];
  for (const input of parsed.data.input) {
    try {
      const subunit = parseRawStmInput(
        JSON.parse(input),
        BatcherInnerGrammar,
        KeyedBuiltinBatcherInnerGrammar,
      );
      const parsed = {
        ...subunit.data,
        addressType: Number.parseInt(subunit.prefix),
      } as BatchedSubunit;
      result.push({ raw: input, parsed });
    } catch (_e) {} // ignore malformed inputs
  }
  return result;
}
