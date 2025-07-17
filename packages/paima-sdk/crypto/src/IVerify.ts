import type { Signature, WalletAddress } from "@paima/utils";

export interface IVerify {
  verifyAddress(address: WalletAddress): boolean;
  verifySignature(
    userAddress: WalletAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean>;
}
