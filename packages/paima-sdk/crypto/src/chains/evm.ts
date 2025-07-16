import type { IVerify } from "../IVerify.ts";
import { createPublicClient, http, isAddress } from "viem";
import { mainnet } from "viem/chains";

export class EvmCrypto implements IVerify {
  verifyAddress = (address: string): Promise<boolean> => {
    return new Promise((resolve) => resolve(isAddress(address)));
  };
  verifySignature = async (
    signerAddress: `0x${string}`,
    message: string,
    signature: `0x${string}`,
  ): Promise<boolean> => {
    // Note we will not be using the transport or chain in the operations.
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    return await publicClient.verifyMessage({
      address: signerAddress,
      message,
      signature,
    });
  };
}
