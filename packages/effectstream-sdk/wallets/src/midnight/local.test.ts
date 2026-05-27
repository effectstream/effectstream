import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { AddressType } from "@effectstream/utils";
import { verifySignature } from "@midnight-ntwrk/ledger-v8";
import { CryptoManager } from "@effectstream/crypto";
import { MidnightLocalConnector, type MidnightLocalApi } from "./local.ts";

const DETERMINISTIC_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

describe("MidnightLocalProvider", () => {
  test("derives an unshielded bech32 address from a deterministic seed", async () => {
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: DETERMINISTIC_SEED,
      networkId: "undeployed",
    });
    const { type, address } = provider.getAddress();
    expect(type).toBe(AddressType.MIDNIGHT);
    expect(typeof address).toBe("string");
    expect(address.length).toBeGreaterThan(0);
  });

  test("signMessage produces a signature that verifies via ledger-v8", async () => {
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: DETERMINISTIC_SEED,
      networkId: "undeployed",
    });
    const api = provider.getConnection().api as unknown as MidnightLocalApi;
    const message = "hello effectstream";
    const signed = await api.signData(message, {
      encoding: "text",
      keyType: "unshielded",
    });

    const messageBytes = Buffer.from(message, "utf-8");
    const ok = verifySignature(
      signed.verifyingKey as never,
      messageBytes,
      signed.signature as never,
    );
    expect(ok).toBe(true);

    // signMessage on the IProvider surface returns "signature|verifyingKey"
    // (Midnight signing is non-deterministic, so the inner signature differs
    // each call). The combined form is what CryptoManager.Midnight() consumes.
    const sig = await provider.signMessage(message);
    const [innerSig, innerVk, ...rest] = sig.split("|");
    expect(rest).toEqual([]);
    expect(innerVk).toBe(signed.verifyingKey);
    const okAgain = verifySignature(
      innerVk as never,
      messageBytes,
      innerSig as never,
    );
    expect(okAgain).toBe(true);
  });

  test("signMessage round-trips through CryptoManager.Midnight().verifySignature", async () => {
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: DETERMINISTIC_SEED,
      networkId: "undeployed",
    });
    const message = "hello effectstream from @effectstream/crypto";
    const sig = await provider.signMessage(message);

    const midnightCrypto = CryptoManager.getCryptoManager(AddressType.MIDNIGHT);
    const ok = await midnightCrypto.verifySignature(
      provider.getAddress().address,
      message,
      sig,
    );
    expect(ok).toBe(true);

    // Tampering with the message must fail verification.
    const tampered = await midnightCrypto.verifySignature(
      provider.getAddress().address,
      `${message} tampered`,
      sig,
    );
    expect(tampered).toBe(false);
  });
});
