import type { Signature, WalletAddress } from "@effectstream/utils";

export interface IVerify {
  verifyAddress(address: WalletAddress): boolean;
  verifySignature(
    userAddress: WalletAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean>;
  decodeAddress(address: WalletAddress): string;
}
