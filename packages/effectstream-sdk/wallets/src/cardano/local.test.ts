import { describe, expect, test } from "bun:test";
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";
import { CardanoLocalConnector } from "./local.ts";

describe("CardanoLocalProvider", () => {
  test("connect from seed produces a bech32 address", async () => {
    const provider = await CardanoLocalConnector.instance().connectFromSeed({
      network: "Preview",
    });
    const { type, address } = provider.getAddress();
    expect(type).toBe(AddressType.CARDANO);
    expect(address.startsWith("addr_test1")).toBe(true);
  });

  test("signMessage produces a signature that @effectstream/crypto verifies", async () => {
    const provider = await CardanoLocalConnector.instance().connectFromSeed({
      network: "Preview",
    });
    const message = "hello effectstream";
    const signature = await provider.signMessage(message);

    const cardanoCrypto = CryptoManager.getCryptoManager(AddressType.CARDANO);
    const ok = await cardanoCrypto.verifySignature(
      provider.getAddress().address,
      message,
      signature,
    );
    expect(ok).toBe(true);
  });
});
