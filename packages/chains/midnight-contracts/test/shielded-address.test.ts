// E3 (00050): shielded address decoding for third-party shielded mints.
// Vectors follow the Night Market helper's tests (acedward/solana-night-market
// @ 10b29b1, relay/test/shielded-address.test.ts): checked against the wallet
// SDK's own codec, plus fixed regression vectors produced by that codec.
import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { bech32m } from "@scure/base";
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from "@midnightntwrk/wallet-sdk-address-format";

import {
  ShieldedAddressError,
  formatShieldedAddress,
  parseShieldedAddress,
  shieldedAddressToCoinEncPublicKeyMapping,
} from "../src/shielded-address.ts";

const CPK = "0102030405060708091011121314151617181920212223242526272829303132";
const EPK = "a1a2a3a4a5a6a7a8a9b0b1b2b3b4b5b6b7b8b9c0c1c2c3c4c5c6c7c8c9d0d1d2";

// Encoded with @midnightntwrk/wallet-sdk-address-format 4.0.0-beta.2.
const VECTORS: Record<string, string> = {
  undeployed:
    "mn_shield-addr_undeployed1qypqxpq9qcrsszgszyfpx9q4zct3sxfqyy3zxfp9ycnjs2fsxye2rg4r5jj6dfag4xctrv4nkj6mddach8qvrskrcnzud37ge8gdr5sw8fvkp",
  stagenet:
    "mn_shield-addr_stagenet1qypqxpq9qcrsszgszyfpx9q4zct3sxfqyy3zxfp9ycnjs2fsxye2rg4r5jj6dfag4xctrv4nkj6mddach8qvrskrcnzud37ge8gdr5sdlafgt",
  mainnet:
    "mn_shield-addr1qypqxpq9qcrsszgszyfpx9q4zct3sxfqyy3zxfp9ycnjs2fsxye2rg4r5jj6dfag4xctrv4nkj6mddach8qvrskrcnzud37ge8gdr5s6d98r3",
};

function sdkEncode(networkId: string, cpk: string, epk: string): string {
  return MidnightBech32m.encode(
    networkId as never,
    new ShieldedAddress(
      ShieldedCoinPublicKey.fromHexString(cpk),
      new ShieldedEncryptionPublicKey(Buffer.from(epk, "hex")),
    ),
  ).asString();
}

describe("parseShieldedAddress (E3)", () => {
  test("decodes the fixed vectors (above bech32's 90-character limit)", () => {
    for (const [networkId, address] of Object.entries(VECTORS)) {
      expect(address.length).toBeGreaterThan(90);
      expect(parseShieldedAddress(address)).toEqual({
        coinPublicKey: CPK,
        encryptionPublicKey: EPK,
        networkId,
      });
      expect(parseShieldedAddress(address, networkId).networkId).toBe(networkId);
      expect(formatShieldedAddress({ coinPublicKey: CPK, encryptionPublicKey: EPK }, networkId))
        .toBe(address);
    }
  });

  test("decodes what the wallet SDK encodes, and encodes what it decodes", () => {
    for (const networkId of ["undeployed", "stagenet", "preprod", "preview", "mainnet"]) {
      const cpk = randomBytes(32).toString("hex");
      const epk = randomBytes(32).toString("hex");
      const sdk = sdkEncode(networkId, cpk, epk);
      expect(parseShieldedAddress(sdk, networkId)).toEqual({
        coinPublicKey: cpk,
        encryptionPublicKey: epk,
        networkId,
      });
      expect(formatShieldedAddress({ coinPublicKey: cpk, encryptionPublicKey: epk }, networkId))
        .toBe(sdk);
    }
  });

  test("trims surrounding whitespace", () => {
    expect(parseShieldedAddress(`  ${VECTORS.undeployed}\n`).coinPublicKey).toBe(CPK);
  });

  test("returns the [coinPublicKey, encryptionPublicKey] mapping pair", () => {
    expect(shieldedAddressToCoinEncPublicKeyMapping(VECTORS.stagenet, "stagenet"))
      .toEqual([CPK, EPK]);
  });

  test("refuses another network", () => {
    expect(() => parseShieldedAddress(VECTORS.stagenet, "undeployed")).toThrow(
      /network "stagenet", expected "undeployed"/,
    );
    expect(() => parseShieldedAddress(VECTORS.mainnet, "undeployed")).toThrow(
      /network "mainnet"/,
    );
  });

  test("refuses another kind of address, a corrupted checksum and garbage", () => {
    const cpkOnly = ShieldedCoinPublicKey.codec
      .encode("undeployed" as never, ShieldedCoinPublicKey.fromHexString("33".repeat(32)))
      .asString();
    expect(() => parseShieldedAddress(cpkOnly, "undeployed")).toThrow(
      /Not a shielded wallet address/,
    );

    const last = VECTORS.undeployed.at(-1)!;
    const corrupted = VECTORS.undeployed.slice(0, -1) + (last === "q" ? "p" : "q");
    expect(() => parseShieldedAddress(corrupted)).toThrow(ShieldedAddressError);

    for (const bad of ["hello", "", "mn_shield-addr_undeployed1", "0x" + CPK + EPK]) {
      expect(() => parseShieldedAddress(bad)).toThrow(ShieldedAddressError);
    }
  });

  test("refuses a shielded prefix with the wrong payload length", () => {
    const short = formatShortAddress("undeployed", 32);
    expect(() => parseShieldedAddress(short)).toThrow(/payload is 32 bytes, expected 64/);
  });

  test("formatShieldedAddress validates its keys", () => {
    expect(() =>
      formatShieldedAddress({ coinPublicKey: "11", encryptionPublicKey: EPK }, "undeployed")
    ).toThrow(ShieldedAddressError);
  });
});

// A bech32m string with the shielded prefix but a payload of `length` bytes.
function formatShortAddress(networkId: string, length: number): string {
  return bech32m.encode(
    `mn_shield-addr_${networkId}`,
    bech32m.toWords(new Uint8Array(length).fill(7)),
    false,
  );
}
