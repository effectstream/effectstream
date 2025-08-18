import {
  type CardanoAddress,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@paima/utils";
import type { IVerify } from "../IVerify.ts";
import { Value } from "@sinclair/typebox/value";

export class CardanoCrypto implements IVerify {
  verifyAddress = (address: WalletAddress): address is CardanoAddress => {
    return Value.Check(TypeboxHelpers.Cardano.Address, address);
  };
  verifySignature = async (
    userAddress: WalletAddress,
    message: string,
    sigStruct: Signature,
  ): Promise<boolean> => {
    try {
      if (!this.verifyAddress(userAddress)) {
        return false;
      }
      const [signature, key, ...remainder] = sigStruct.split("+");
      if (!signature || !key || remainder.length > 0) {
        return false;
      }
      const { default: verifyCardanoDataSignature } = await import(
        "npm:@cardano-foundation/cardano-verify-datasignature"
      );
      return verifyCardanoDataSignature.default(
        signature,
        key,
        message,
        userAddress,
      );
    } catch (err) {
      console.error(
        "[address-validator] error verifying cardano signature:",
        err,
      );
      return false;
    }
  };
}
