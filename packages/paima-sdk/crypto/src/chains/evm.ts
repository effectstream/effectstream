import {
  type EvmAddress,
  type EvmSignature,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@paima/utils";
import type { IVerify } from "../IVerify.ts";
import { verifyMessage } from "viem";
import { Value } from "@sinclair/typebox/value";

export class EvmCrypto implements IVerify {
  isEvmSignature = (signature: Signature): signature is EvmSignature => {
    return Value.Check(TypeboxHelpers.Evm.Signature, signature);
  };
  verifyAddress = (address: WalletAddress): address is EvmAddress => {
    return Value.Check(TypeboxHelpers.Evm.Address, address);
  };
  verifySignature = async (
    signerAddress: WalletAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean> => {
    try {
      if (this.verifyAddress(signerAddress) && this.isEvmSignature(signature)) {
        return await verifyMessage({
          address: signerAddress,
          message,
          signature,
        });
      }
    } catch {
      // do nothing, error messages are expected if the signature is invalid
    }
    return false;
  };
}
