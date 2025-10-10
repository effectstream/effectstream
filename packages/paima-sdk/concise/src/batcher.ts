import {
  AddressType,
  type Signature,
  type TimestampMsStr,
  TypeboxHelpers,
  type WalletAddress,
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
import { Value } from "@sinclair/typebox/value";
const { keccak_256 } = sha3;

export interface DefaultBatcherInput {
  addressType: AddressType;
  input: string;
  signature: string;
  address: string;
  timestamp: string;
  target?: string;
}

/**
 * @deprecated Use DefaultBatcherInput instead. This type will be removed in a future version.
 */
export type BatchedSubunit = DefaultBatcherInput;

export type BatcherMessage = string;

export function createBatcherSubunit(
  millisecondTimestamp: TimestampMsStr,
  _walletAddress: WalletAddress,
  walletAddressType: AddressType,
  signature: Signature,
  inputData: string,
): DefaultBatcherInput {
  let walletAddress;
  switch (walletAddressType) {
    case AddressType.EVM:
      walletAddress = Value.Decode(TypeboxHelpers.Evm.Address, _walletAddress);
      break;
    default:
      throw new Error(
        "NYI: Unsupported wallet address type: " + walletAddressType,
      );
  }
  return {
    addressType: walletAddressType,
    address: walletAddress,
    signature: signature,
    input: inputData,
    timestamp: millisecondTimestamp,
  };
}

/** This is what wallets sign when submitting a batch */
export function createMessageForBatcher(
  namespace: string | null,
  millisecondTimestamp: TimestampMsStr,
  _walletAddress: WalletAddress,
  walletAddressType: AddressType,
  inputData: string,
  target: string | undefined = undefined,
): BatcherMessage {
  let walletAddress;
  switch (walletAddressType) {
    case AddressType.EVM:
      walletAddress = Value.Decode(TypeboxHelpers.Evm.Address, _walletAddress);
      break;
    default:
      throw new Error(
        "NYI: Unsupported wallet address type: " + walletAddressType,
      );
  }

  return ((namespace ?? "") + (target ?? "") + millisecondTimestamp +
    walletAddress + inputData)
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
export function hashBatchSubunit(input: DefaultBatcherInput): string {
  let walletAddress;
  switch (input.addressType) {
    case AddressType.EVM:
      walletAddress = Value.Decode(
        TypeboxHelpers.Evm.Address,
        input.address,
      );
      break;
    default:
      throw new Error(
        "NYI: Unsupported wallet address type: " + input.addressType,
      );
  }

  return "0x" +
    keccak_256(
      walletAddress + input.input + input.timestamp,
    );
}

/**
 * Adds batches until maxSize is reached, or not batches are left
 * If a batch is empty, empty string is returned (not `B`)
 * The inputs that got selected (taking into account the size limit) are returned
 */
export function buildBatchData(
  maxSize: number,
  inputs: DefaultBatcherInput[],
): {
  selectedInputs: DefaultBatcherInput[];
  data: string;
} {
  const selectedInputs: DefaultBatcherInput[] = [];
  const batchedTransaction: string[] = [];
  let remainingSpace = maxSize -
    `["${BatcherGrammarPrefix.batcherInput}", []`.length;

  for (const input of inputs) {
    const packed = generateStmInput(
      BatcherInnerGrammar,
      `${input.addressType}`,
      {
        userAddress: input.address,
        userSignature: input.signature,
        conciseInput: input.input,
        millisecondTimestamp: input.timestamp,
      },
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
  parsed: DefaultBatcherInput;
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
      const parsed: DefaultBatcherInput = {
        addressType: Number.parseInt(subunit.prefix),
        address: subunit.data.userAddress,
        signature: subunit.data.userSignature,
        input: subunit.data.conciseInput,
        timestamp: subunit.data.millisecondTimestamp,
      };
      result.push({ raw: input, parsed });
    } catch (_e) {
      // ignore malformed inputs
    }
  }
  return result;
}
