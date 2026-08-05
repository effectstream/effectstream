import {
  type AlgorandAddress,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@effectstream/utils/types";
import type { IVerify } from "../IVerify.ts";
import { Value } from "@sinclair/typebox/value";
import { utf8ToHex } from "web3-utils";
import {
  type Transaction,
  type SuggestedParams,
  makePaymentTxnWithSuggestedParamsFromObject,
  decodeSignedTransaction,
  type SignedTransaction,
  verifyBytes,
  decodeAddress,
} from "algosdk";
import { Buffer } from "node:buffer";

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

      // Helper to convert hex to Uint8Array
      const fromHexString = (hexString: string) =>
        new Uint8Array(
          hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        );

      // 1. Prepare the Signature
      const signatureBytes = fromHexString(sigStruct);

      // 2. Prepare the Message with the "MX" prefix
      // Algorand standard signing (algosdk.signBytes) prepends "MX"
      // verifyBytes verifies exactly what is passed, so we must reconstruct "MX" + message
      const enc = new TextEncoder();
      const encodedMessage = enc.encode(message);
      const tag = enc.encode("MX");
      const dataToVerify = new Uint8Array(tag.length + encodedMessage.length);
      dataToVerify.set(tag);
      dataToVerify.set(encodedMessage, tag.length);

      // 3. Verify
      // Note: pass 'userAddress' (string), NOT the decoded object.
      const result = verifyBytes(encodedMessage, signatureBytes, userAddress);
      console.log("TODO: ALGORAND VERIFY RESULT IS ALWAYS FALSE:", {result, encodedMessage, signatureBytes, userAddress});
      return result;
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

  decodeAddress(address: WalletAddress): WalletAddress{
    return Value.Decode(TypeboxHelpers.Algorand.Address, address);
  }
}
