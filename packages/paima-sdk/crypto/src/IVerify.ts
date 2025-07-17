import type { Signature, WalletAddress } from "@paima/utils";

export interface IVerify {
  verifyAddress(address: WalletAddress): Promise<boolean>;
  verifySignature(
    userAddress: WalletAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean>;
}
