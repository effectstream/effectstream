import { test, expect } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { Buffer } from "node:buffer";
import { CryptoManager } from "../CryptoManager.ts";
import { AddressType } from "@effectstream/utils";

const crypto = () => CryptoManager.getCryptoManager(AddressType.SOLANA);

function makeWallet() {
  const privateKey = ed25519.utils.randomPrivateKey();
  const address = bs58.encode(ed25519.getPublicKey(privateKey));
  const sign = (message: string) =>
    Buffer.from(
      ed25519.sign(new TextEncoder().encode(message), privateKey),
    ).toString("base64");
  return { address, sign };
}

test("Solana: verifies a valid Ed25519 signature (sign → verify round-trip)", async () => {
  const { address, sign } = makeWallet();
  const message = "effectstream solana login";
  expect(crypto().verifyAddress(address)).toBe(true);
  expect(await crypto().verifySignature(address, message, sign(message))).toBe(
    true,
  );
});

test("Solana: rejects a tampered message", async () => {
  const { address, sign } = makeWallet();
  const sig = sign("real message");
  expect(
    await crypto().verifySignature(address, "tampered message", sig),
  ).toBe(false);
});

test("Solana: rejects a signature made by a different key", async () => {
  const victim = makeWallet();
  const attacker = makeWallet();
  const message = "transfer all funds";
  expect(
    await crypto().verifySignature(victim.address, message, attacker.sign(message)),
  ).toBe(false);
});

test("Solana: rejects an invalid address", () => {
  expect(crypto().verifyAddress("not-a-valid-solana-address-0OIl")).toBe(false);
  expect(crypto().verifyAddress("")).toBe(false);
});
