import type { IVerify } from "../IVerify.ts";
import { isAddress, verifyMessage } from "viem";

export class EvmCrypto implements IVerify {
  verifyAddress = (address: string): address is EvmAddress => {
    return Value.Check(TypeboxHelpers.Evm.Address, address);
  };
  verifySignature = async (
    signerAddress: EvmAddress,
    message: string,
    signature: Signature
  ): Promise<boolean> => {
    try {
      return await verifyMessage({
        address: signerAddress,
        message,
        signature,
      });
    } catch {
      return false;
    }
  };
}
