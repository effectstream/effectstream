import type { Signature, WalletAddress } from "@effectstream/utils/types";

export interface IVerify {
  verifyAddress(address: WalletAddress): boolean;
  verifySignature(
    userAddress: WalletAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean>;
  decodeAddress(address: WalletAddress): string;
}
