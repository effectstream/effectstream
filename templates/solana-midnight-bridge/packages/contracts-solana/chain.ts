// Small RPC helpers shared by the scripts and tests (the relayer can use the
// receipt check before sending a Release, so retries stay cheap).
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  type Keypair,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  decodeConfig,
  decodeReceipt,
  findConfigAddress,
  findReceiptAddress,
  type BridgeConfig,
  type BridgeReceipt,
} from "./instructions.ts";

export type SentTx = {
  signature: string;
  slot: number;
  /** `meta.err` of the landed transaction (null on success). */
  err: unknown;
  logs: string[];
};

/**
 * Signs (first signer pays), sends and confirms at `confirmed`, then returns the
 * landed transaction's slot, error and logs. With `skipPreflight` a failing
 * transaction still lands on chain, so callers can assert the on-chain refusal.
 */
export async function sendTx(
  conn: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  opts: { skipPreflight?: boolean } = {},
): Promise<SentTx> {
  if (signers.length === 0) throw new Error("sendTx needs at least one signer (the fee payer)");
  const tx = new Transaction().add(...instructions);
  tx.feePayer = signers[0]!.publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(...signers);
  const signature = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: opts.skipPreflight ?? false,
    preflightCommitment: "confirmed",
  });
  try {
    await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  } catch (e) {
    // web3.js rejects with the bare TransactionError (a plain object, not an
    // Error) when its signature-status poll sees a failed transaction before
    // the signature notification does. The transaction landed: read it below,
    // so callers get its error and logs either way (PR-2 T6, F-T6.5).
    if (e instanceof Error || e === null || typeof e !== "object") throw e;
  }
  // getTransaction can lag confirmTransaction by a moment on a busy validator.
  for (let i = 0; i < 20; i++) {
    const info = await conn.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (info) {
      return {
        signature,
        slot: info.slot,
        err: info.meta?.err ?? null,
        logs: info.meta?.logMessages ?? [],
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`transaction ${signature} confirmed but getTransaction returned nothing`);
}

/** `{ InstructionError: [index, { Custom: code }] }` → `{ index, code }`, else null. */
export function customErrorOf(err: unknown): { index: number; code: number } | null {
  const ie = (err as { InstructionError?: unknown } | null)?.InstructionError;
  if (!Array.isArray(ie) || typeof ie[0] !== "number") return null;
  const custom = (ie[1] as { Custom?: unknown } | undefined)?.Custom;
  return typeof custom === "number" ? { index: ie[0], code: custom } : null;
}

/** The bridge config, or null when the program is not initialized. */
export async function fetchBridgeConfig(
  conn: Connection,
  programId: PublicKey,
): Promise<BridgeConfig | null> {
  const [config] = findConfigAddress(programId);
  const info = await conn.getAccountInfo(config, "confirmed");
  if (!info || !info.owner.equals(programId)) return null;
  return decodeConfig(info.data);
}

/** The release receipt for `withdrawalId`, or null when it was never released. */
export async function fetchReceipt(
  conn: Connection,
  programId: PublicKey,
  withdrawalId: bigint,
): Promise<BridgeReceipt | null> {
  const [receipt] = findReceiptAddress(programId, withdrawalId);
  const info = await conn.getAccountInfo(receipt, "confirmed");
  if (!info || !info.owner.equals(programId)) return null;
  return decodeReceipt(info.data);
}

/** Local validator only: airdrops until `pubkey` holds at least `minSol`. */
export async function airdropAtLeast(
  conn: Connection,
  pubkey: PublicKey,
  minSol: number,
): Promise<void> {
  const want = BigInt(Math.round(minSol * LAMPORTS_PER_SOL));
  for (let round = 0; round < 5; round++) {
    const have = BigInt(await conn.getBalance(pubkey, "confirmed"));
    if (have >= want) return;
    const sig = await conn.requestAirdrop(pubkey, Number(want - have));
    const bh = await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  }
  const have = await conn.getBalance(pubkey, "confirmed");
  if (BigInt(have) < want) {
    throw new Error(`airdrop to ${pubkey.toBase58()} stalled at ${have} lamports`);
  }
}
