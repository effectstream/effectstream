import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import {
  addressFromKey,
  signData,
  signatureVerifyingKey,
  signingKeyFromBip340,
} from "@midnightntwrk/ledger-v9";
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";
import type { WalletAddress } from "@effectstream/utils/types";
import { MidnightCrypto } from "../src/chains/midnight.ts";

describe("Midnight Ledger-v9 signature verification", () => {
  test("verifies a tagged Schnorr signature through address-format 4", async () => {
    const signingKey = signingKeyFromBip340(new Uint8Array(32).fill(1));
    const verifyingKey = signatureVerifyingKey(signingKey);
    const message = "effectstream Ledger-v9 tagged signature";
    const signature = signData(signingKey, new TextEncoder().encode(message));
    const address = MidnightBech32m.encode(
      "undeployed",
      new UnshieldedAddress(Buffer.from(addressFromKey(verifyingKey), "hex")),
    ).asString() as WalletAddress;

    expect(verifyingKey.tag).toBe("schnorr");
    expect(signature.tag).toBe("schnorr");

    const verifier = new MidnightCrypto();
    const wireSignature = `${signature.value}|${verifyingKey.value}`;
    expect(await verifier.verifySignature(address, message, wireSignature as never)).toBe(true);
    expect(
      await verifier.verifySignature(
        address,
        `${message} tampered`,
        wireSignature as never,
      ),
    ).toBe(false);
  });
});
