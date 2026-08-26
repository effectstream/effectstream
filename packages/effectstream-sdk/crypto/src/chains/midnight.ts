import {
  type MidnightAddress,
  type MidnightSignature,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@effectstream/utils/types";
import type { IVerify } from "../IVerify.ts";
import { Value } from "@sinclair/typebox/value";

/**
 * Verifies Midnight unshielded signatures produced by
 * `@effectstream/wallets`' `MidnightLocalProvider.signMessage`.
 *
 * Signature format: `"<hex signature>|<hex verifying key>"`.
 *
 * Midnight unshielded signatures are not self-recovering (unlike EVM ECDSA),
 * so the verifying key must be ferried alongside the signature — mirroring
 * Cardano's `"sig+key"` convention, just with `|` to keep the formats distinct.
 *
 * The verifier:
 *   1. Splits the combined signature into its two halves.
 *   2. Derives the canonical hex address from the verifying key
 *      (`ledger-v9.addressFromKey(vk)`) and asserts it matches the bech32
 *      address claimed by the caller. This prevents anyone holding *some*
 *      Midnight key from impersonating `signerAddress` with their own.
 *   3. Calls `ledger-v9.verifySignature(vk, messageBytes, signature)` with
 *      the required tagged Schnorr key/signature values.
 */
export class MidnightCrypto implements IVerify {
  isMidnightSignature = (
    signature: Signature,
  ): signature is MidnightSignature => {
    return Value.Check(TypeboxHelpers.Midnight.Signature, signature);
  };
  verifyAddress = (address: WalletAddress): address is MidnightAddress => {
    return Value.Check(TypeboxHelpers.Midnight.Address, address);
  };
  verifySignature = async (
    signerAddress: WalletAddress,
    message: string,
    sigStruct: Signature,
  ): Promise<boolean> => {
    try {
      if (!this.verifyAddress(signerAddress)) return false;
      if (typeof sigStruct !== "string") return false;
      if (!this.isMidnightSignature(sigStruct)) return false;

      const parts = sigStruct.split("|");
      if (parts.length !== 2) return false;
      const [signature, verifyingKey] = parts;
      if (!signature || !verifyingKey) return false;

      const [ledgerMod, addrMod] = await Promise.all([
        import("@midnightntwrk/ledger-v9"),
        import("@midnightntwrk/wallet-sdk-address-format"),
      ]);

      const taggedVerifyingKey = {
        tag: "schnorr" as const,
        value: verifyingKey,
      };
      const taggedSignature = {
        tag: "schnorr" as const,
        value: signature,
      };

      // The verifying key must derive to the address being verified —
      // otherwise the holder of any Midnight signing key could pretend to
      // sign on behalf of `signerAddress`.
      const expectedHexAddress = ledgerMod
        .addressFromKey(taggedVerifyingKey)
        .toLowerCase();
      let decodedHex: string;
      try {
        const bech32 = addrMod.MidnightBech32m.parse(signerAddress);
        const decoded = bech32.decode(
          addrMod.UnshieldedAddress,
          bech32.network,
        );
        decodedHex = decoded.hexString.toLowerCase();
      } catch {
        // Shielded / dust / non-unshielded bech32s land here. The current
        // MidnightLocalProvider only emits unshielded addresses, so anything
        // else is a verify-mismatch by construction.
        return false;
      }
      if (decodedHex !== expectedHexAddress) return false;

      const messageBytes = new TextEncoder().encode(message);
      return ledgerMod.verifySignature(
        taggedVerifyingKey,
        messageBytes,
        taggedSignature,
      );
    } catch (err) {
      console.error(
        "[MidnightCrypto] error verifying signature:",
        err,
      );
      return false;
    }
  };

  decodeAddress(address: WalletAddress): WalletAddress {
    return Value.Decode(TypeboxHelpers.Midnight.Address, address);
  }
}
