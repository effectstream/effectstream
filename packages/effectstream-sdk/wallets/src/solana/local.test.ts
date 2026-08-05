import { test, expect } from "bun:test";
import { SolanaLocalConnector } from "./local.ts";
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils/types";

const verifier = () => CryptoManager.getCryptoManager(AddressType.SOLANA);

test("SolanaLocal: wallet signs and CryptoManager.Solana verifies (round-trip)", async () => {
  const provider = await SolanaLocalConnector.instance().connectFromSeed();
  const { address, type } = provider.getAddress();
  expect(type).toBe(AddressType.SOLANA);

  const message = "effectstream login challenge";
  const signature = await provider.signMessage(message);

  expect(await verifier().verifySignature(address, message, signature)).toBe(
    true,
  );
  expect(
    await verifier().verifySignature(address, "different message", signature),
  ).toBe(false);
});

test("SolanaLocal: a given secret key is deterministic", async () => {
  const p1 = await SolanaLocalConnector.instance().connectFromSeed();
  const secretKey = p1.getConnection().api.secretKey;
  const p2 = await SolanaLocalConnector.instance().connectFromSeed({ secretKey });
  expect(p2.getAddress().address).toBe(p1.getAddress().address);
});
