import {
  type Signature,
  type SubstrateAddress,
  TypeboxHelpers,
} from "@paima/utils";
import type { IVerify } from "../IVerify.ts";
import { Value } from "@sinclair/typebox/value";

export class PolkadotCrypto implements IVerify {
  verifyAddress = (address: string): address is SubstrateAddress => {
    return Value.Check(TypeboxHelpers.Substrate.Address, address);
  };
  verifySignature = async (
    userAddress: SubstrateAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean> => {
    try {
      const { cryptoWaitReady, decodeAddress, signatureVerify } = await import(
        "@polkadot/util-crypto"
      );
      const { u8aToHex } = await import("@polkadot/util");
      await cryptoWaitReady();
      const publicKey = decodeAddress(userAddress);
      const hexPublicKey = u8aToHex(publicKey);
      return signatureVerify(message, signature, hexPublicKey).isValid;
    } catch (err) {
      console.error(
        "[address-validator] error verifying polkadot signature:",
        err,
      );
      return false;
    }
  };
}
