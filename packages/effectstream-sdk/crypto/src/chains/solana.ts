import type { Signature, WalletAddress } from "@effectstream/utils";
import type { IVerify } from "../IVerify.ts";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { Buffer } from "node:buffer";

/**
 * Solana signature verification.
 *
 * Solana addresses are base58-encoded Ed25519 public keys (32 bytes), and
 * `signMessage` from a Solana wallet produces a 64-byte Ed25519 signature.
 * The Effectstream Solana wallet returns that signature base64-encoded
 * (see packages/effectstream-sdk/wallets/src/solana), so verification:
 *   - base58-decodes the address to the 32-byte public key,
 *   - base64-decodes the signature to 64 bytes,
 *   - verifies it over the UTF-8 message bytes.
 */
export class SolanaCrypto implements IVerify {
  verifyAddress = (address: WalletAddress): boolean => {
    try {
      return bs58.decode(address).length === 32;
    } catch {
      return false;
    }
  };

  verifySignature = async (
    userAddress: WalletAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean> => {
    try {
      if (!this.verifyAddress(userAddress)) {
        return false;
      }
      const publicKey = bs58.decode(userAddress);
      const signatureBytes = new Uint8Array(Buffer.from(signature, "base64"));
      if (signatureBytes.length !== 64) {
        return false;
      }
      const messageBytes = new TextEncoder().encode(message);
      return ed25519.verify(signatureBytes, messageBytes, publicKey);
    } catch (err) {
      console.error(
        "[address-validator] error verifying solana signature:",
        err,
      );
      return false;
    }
  };

  decodeAddress(address: WalletAddress): string {
    // Solana addresses are already canonical base58 public keys.
    return address;
  }
}
