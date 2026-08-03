import { describe, expect, test } from "bun:test";
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils/types";
import { ViemConnector } from "./viem.ts";

const TEST_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const EXPECTED_ADDR = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

describe("ViemEvmProvider", () => {
  test("derives the hardhat default address from its private key", async () => {
    const provider = await ViemConnector.instance().connectFromPrivateKey({
      privateKey: TEST_KEY,
      rpcUrl: "http://localhost:8545",
    });
    const { type, address } = provider.getAddress();
    expect(type).toBe(AddressType.EVM);
    expect(address).toBe(EXPECTED_ADDR);
  });

  test("signMessage produces a signature that @effectstream/crypto verifies", async () => {
    const provider = await ViemConnector.instance().connectFromPrivateKey({
      privateKey: TEST_KEY,
      rpcUrl: "http://localhost:8545",
    });
    const message = "hello effectstream";
    const signature = await provider.signMessage(message);

    const evmCrypto = CryptoManager.getCryptoManager(AddressType.EVM);
    const ok = await evmCrypto.verifySignature(
      provider.getAddress().address,
      message,
      signature,
    );
    expect(ok).toBe(true);
  });
});
