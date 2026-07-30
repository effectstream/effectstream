import { describe, expect, test } from "bun:test";
import { AddressType } from "@effectstream/utils";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { SolanaProvider, type SolanaApi } from "./solana.ts";
import type { ActiveConnection } from "../IProvider.ts";

const ADDRESS = "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM";

/** Deterministic signer so assertions can look for its signature. */
const USER = Keypair.fromSeed(new Uint8Array(32).fill(5));
const SPONSOR = Keypair.fromSeed(new Uint8Array(32).fill(6));
const BLOCKHASH = Keypair.generate().publicKey.toBase58();

/** A real, unsigned legacy transaction in the shape the batcher expects. */
function buildUnsignedTx(): { tx: Transaction; base64: string } {
  const tx = new Transaction();
  tx.feePayer = SPONSOR.publicKey;
  tx.recentBlockhash = BLOCKHASH;
  tx.add(SystemProgram.transfer({
    fromPubkey: USER.publicKey,
    toPubkey: new PublicKey(ADDRESS),
    lamports: 1,
  }));
  return {
    tx,
    base64: tx.serialize({ requireAllSignatures: false }).toString("base64"),
  };
}

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

  test("signTransaction hands the wallet a Transaction OBJECT, not raw bytes", async () => {
    // The regression this guards: passing raw bytes works for the Wallet
    // Standard bridge but breaks every injected wallet (Phantom, Backpack,
    // Solflare), which expect a web3.js Transaction and return a signed one.
    // The previous mock echoed bytes back, so it could not distinguish the two.
    const { tx, base64 } = buildUnsignedTx();

    let received: unknown = null;
    const conn = mockConnection({
      signTransaction: async (t: unknown) => {
        received = t;
        (t as Transaction).partialSign(USER);
        return t;
      },
    });

    const signed = await new SolanaProvider(conn, ADDRESS)
      .signTransaction(base64);

    expect(received).not.toBeInstanceOf(Uint8Array);
    expect(typeof (received as any)?.serialize).toBe("function");
    expect((received as Transaction).instructions.length)
      .toBe(tx.instructions.length);

    // The result must be base64 that SolanaAdapter.deserialize() can parse,
    // carrying the signature the wallet just added.
    const parsed = Transaction.from(Buffer.from(signed, "base64"));
    expect(parsed.signatures.some(
      (s) => s.publicKey.equals(USER.publicKey) && s.signature !== null,
    )).toBe(true);
  });

  test("signTransaction also accepts a wallet that returns raw bytes", async () => {
    // The Wallet Standard bridge returns serialized bytes rather than an object.
    const { base64 } = buildUnsignedTx();
    const conn = mockConnection({
      signTransaction: async (t: unknown) => {
        const signedTx = t as Transaction;
        signedTx.partialSign(USER);
        return new Uint8Array(
          signedTx.serialize({ requireAllSignatures: false }),
        );
      },
    });

    const signed = await new SolanaProvider(conn, ADDRESS)
      .signTransaction(base64);
    expect(() => Transaction.from(Buffer.from(signed, "base64"))).not.toThrow();
  });

  test("signTransaction rejects an unrecognised wallet result", async () => {
    const { base64 } = buildUnsignedTx();
    const conn = mockConnection({
      signTransaction: async () => "not-a-transaction" as unknown,
    });
    await expect(
      new SolanaProvider(conn, ADDRESS).signTransaction(base64),
    ).rejects.toThrow(/unrecognised signTransaction result/);
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
