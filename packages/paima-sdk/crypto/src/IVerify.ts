export interface IVerify {
  verifyAddress(address: string): Promise<boolean>;
  verifySignature(userAddress: string, message: string, signature: string): Promise<boolean>;
}
