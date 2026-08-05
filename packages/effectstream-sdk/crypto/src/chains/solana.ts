import {
  type SolanaAddress,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@effectstream/utils/types";
import type { IVerify } from "../IVerify.ts";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { Value } from "@sinclair/typebox/value";

export class SolanaCrypto implements IVerify {
  verifyAddress = (address: WalletAddress): address is SolanaAddress => {
    return Value.Check(TypeboxHelpers.Solana.Address, address);
  };
  verifySignature = async (
    userAddress: SolanaAddress,
    message: string,
    sigStruct: Signature,
  ): Promise<boolean> => {
    try {
      if (!this.verifyAddress(userAddress)) {
        return false;
      }
      if (!sigStruct) {
        return false;
      }

      // Solana public keys are base58-encoded 32-byte Ed25519 keys
      const publicKeyBytes = new PublicKey(userAddress).toBytes();

      // The wallet signs the UTF-8 bytes of the canonical message
      const messageBytes = new TextEncoder().encode(message);

      // The wallet emits base64-encoded signatures (see SolanaProvider.signMessage)
      const signatureBytes = new Uint8Array(
        Buffer.from(sigStruct, "base64"),
      );

      return nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes,
      );
    } catch (err) {
      console.error(
        "[address-validator] error verifying solana signature:",
        err,
      );
      return false;
    }
  };

  decodeAddress(address: WalletAddress): WalletAddress {
    return Value.Decode(TypeboxHelpers.Solana.Address, address);
  }
}
