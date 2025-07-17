import type { IVerify } from "../IVerify.ts";
import { isAddress, verifyMessage } from "viem";

export class EvmCrypto implements IVerify {
  verifyAddress = (address: string): Promise<boolean> => {
    return new Promise((resolve) => resolve(isAddress(address)));
  };
  verifySignature = async (
    signerAddress: `0x${string}`,
    message: string,
    signature: `0x${string}`,
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
