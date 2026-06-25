import { describe, expect, test } from "bun:test";
import { AddressType } from "@effectstream/utils";
import bs58 from "bs58";
import { SolanaProvider, type SolanaApi } from "./solana.ts";
import type { ActiveConnection } from "../IProvider.ts";

const ADDRESS = "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM";

function mockConnection(
  overrides: Partial<SolanaApi> = {},
): ActiveConnection<SolanaApi> {
  return {
    metadata: { name: "mock", displayName: "Mock" },
    api: {
      publicKey: { toBase58: () => ADDRESS },
      signMessage: async (_m: Uint8Array) => ({ signature: new Uint8Array() }),
      connect: async () => {},
      disconnect: async () => {},
      ...overrides,
    } as SolanaApi,
  };
}

describe("SolanaProvider", () => {
  test("getAddress returns the SOLANA address type", () => {
    const provider = new SolanaProvider(mockConnection(), ADDRESS);
    const { type, address } = provider.getAddress();
    expect(type).toBe(AddressType.SOLANA);
    expect(address).toBe(ADDRESS);
  });

  test("signTransaction round-trips base58 (not base64)", async () => {
    // Bytes that differ when decoded as base58 vs base64
    const original = new Uint8Array([1, 2, 3, 250, 255, 0, 128, 64]);
    const txBase58 = bs58.encode(original);

    // Mock wallet "signs" by echoing back the decoded bytes unchanged
    const conn = mockConnection({
      signTransaction: async (tx: unknown) => tx as Uint8Array,
    });
    const provider = new SolanaProvider(conn, ADDRESS);

    const signed = await provider.signTransaction(txBase58);

    // The output must be base58-decodable back to the original bytes
    const decoded = bs58.decode(signed);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  test("signTransaction throws when the wallet lacks signTransaction", async () => {
    const conn = mockConnection({ signTransaction: undefined });
    const provider = new SolanaProvider(conn, ADDRESS);
    await expect(provider.signTransaction("abc")).rejects.toThrow(
      /does not support signTransaction/,
    );
  });

  test("signMessage returns a base64-encoded signature", async () => {
    const sigBytes = new Uint8Array([10, 20, 30, 40]);
    const conn = mockConnection({
      signMessage: async (_m: Uint8Array) => ({ signature: sigBytes }),
    });
    const provider = new SolanaProvider(conn, ADDRESS);
    const sig = await provider.signMessage("hello");
    expect(sig).toBe(Buffer.from(sigBytes).toString("base64"));
  });
});
