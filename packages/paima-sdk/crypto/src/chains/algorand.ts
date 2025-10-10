import {
  type AlgorandAddress,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@paima/utils";
import type { IVerify } from "../IVerify.ts";
import { Value } from "@sinclair/typebox/value";
import { utf8ToHex } from "web3-utils";
import {
  type Transaction,
  type SuggestedParams,
  makePaymentTxnWithSuggestedParamsFromObject,
  decodeSignedTransaction,
  type SignedTransaction,
} from "algosdk";
import { Buffer } from "node:buffer";
import { default as verifyCardanoDataSignature } from "@cardano-foundation/cardano-verify-datasignature";

function hexStringToBytes(hexString: string): number[] {
  if (!/^[0-9a-fA-F]+$/.test(hexString)) {
    throw new Error("Non-hex digits found in hex string");
  }
  const bytes: number[] = [];
  if (hexString.length % 2 !== 0) {
    hexString = "0" + hexString;
  }
  for (let c = 0; c < hexString.length; c += 2) {
    const nextByte = hexString.slice(c, c + 2);
    bytes.push(parseInt(nextByte, 16));
  }
  return bytes;
}

function hexStringToUint8Array(hexString: string): Uint8Array {
  return new Uint8Array(hexStringToBytes(hexString));
}

export class AlgorandCrypto implements IVerify {
  verifyAddress = (address: WalletAddress): address is AlgorandAddress => {
    return Value.Check(TypeboxHelpers.Algorand.Address, address);
  };
  verifySignature = async (
    userAddress: WalletAddress,
    message: string,
    sigStruct: Signature
  ): Promise<boolean> => {
    try {
      if (!this.verifyAddress(userAddress)) {
        return false;
      }
      const [signature, key, ...remainder] = sigStruct.split("+");
      if (!signature || !key || remainder.length > 0) {
        return false;
      }
      // const { default: verifyCardanoDataSignature } = await import(
      //   "@cardano-foundation/cardano-verify-datasignature"
      // );
      return verifyCardanoDataSignature.default(
        signature,
        key,
        message,
        userAddress
      );
    } catch (err) {
      console.error(
        "[address-validator] error verifying algorand signature:",
        err
      );
      return false;
    }
  };

  buildAlgorandTransaction = async (
    userAddress: string,
    message: string
  ): Promise<Transaction> => {
    const hexMessage = utf8ToHex(message).slice(2);
    const msgArray = hexStringToUint8Array(hexMessage);
    const SUGGESTED_PARAMS: SuggestedParams = {
      fee: 0,
      firstValid: 10,
      lastValid: 10,
      minFee: 0,
      genesisID: "mainnet-v1.0",
      genesisHash: Uint8Array.from(
        Buffer.from("wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=", "base64")
      ),
    };
    // const { makePaymentTxnWithSuggestedParams } = await import('algosdk');
    return makePaymentTxnWithSuggestedParamsFromObject({
      sender: userAddress,
      receiver: userAddress,
      amount: 0,
      closeRemainderTo: undefined,
      note: msgArray,
      suggestedParams: SUGGESTED_PARAMS,
    });
  };

  decodeSignedTransaction = async (
    signedTx: Uint8Array
  ): Promise<SignedTransaction> => {
    // const { decodeSignedTransaction } = await import('algosdk');
    return decodeSignedTransaction(signedTx);
  };
}
