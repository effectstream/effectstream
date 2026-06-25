import { test, expect } from "bun:test";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { CryptoManager } from "../src/mod.ts";
import { AddressType } from "@effectstream/utils";

const MESSAGE = "effectstream-namespace--target-1700000000000-5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM-hello";

test("SolanaCrypto: verifyAddress accepts a valid Solana address", () => {
  const solana = CryptoManager.getCryptoManager(AddressType.SOLANA);
  // System program address (all-zero 32-byte key, base58 = all ones)
  expect(solana.verifyAddress("11111111111111111111111111111111")).toBe(true);
  // A real base58 32-byte key
  expect(
    solana.verifyAddress("5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM"),
  ).toBe(true);
});

test("SolanaCrypto: verifyAddress rejects a malformed address", () => {
  const solana = CryptoManager.getCryptoManager(AddressType.SOLANA);
  expect(solana.verifyAddress("not-a-solana-address")).toBe(false);
  expect(solana.verifyAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe(
    false,
  );
});

test("SolanaCrypto: verifySignature accepts a valid Ed25519 signature", async () => {
  const solana = CryptoManager.getCryptoManager(AddressType.SOLANA);
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();

  const messageBytes = new TextEncoder().encode(MESSAGE);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const sigB64 = Buffer.from(signature).toString("base64");

  const result = await solana.verifySignature(address, MESSAGE, sigB64 as any);
  expect(result).toBe(true);
});

test("SolanaCrypto: verifySignature rejects a bad signature", async () => {
  const solana = CryptoManager.getCryptoManager(AddressType.SOLANA);
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();

  // Sign a different message
  const badSig = nacl.sign.detached(
    new TextEncoder().encode("totally different message"),
    keypair.secretKey,
  );
  const sigB64 = Buffer.from(badSig).toString("base64");

  const result = await solana.verifySignature(address, MESSAGE, sigB64 as any);
  expect(result).toBe(false);
});

test("SolanaCrypto: verifySignature rejects empty signature", async () => {
  const solana = CryptoManager.getCryptoManager(AddressType.SOLANA);
  const result = await solana.verifySignature(
    "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM",
    MESSAGE,
    "" as any,
  );
  expect(result).toBe(false);
});
