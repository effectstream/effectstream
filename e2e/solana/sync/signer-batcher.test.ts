import { assert, assertSQL } from "@e2e/engine";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Batcher,
  createNewBatcher,
  type DefaultBatcherInput,
  FileStorage,
  signSolanaSignerInput,
  SolanaSignerAdapter,
} from "@effectstream/batcher-sdk";
import type { Client } from "pg";
import { MEMO_PROGRAM_ID } from "../batcher/adapter-solana.ts";

const RPC = "http://localhost:8899";
const TARGET = "solanaOperator";

/** Reject reason of a promise that must reject, or `null` if it resolved. */
async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
}

const statusOf = (e: unknown) =>
  (e as { statusCode?: number } | null)?.statusCode;

/**
 * Operator-signer batcher, end-to-end (PR-1 E5): an EMBEDDED batcher (no HTTP
 * server, driven in-process the way a relayer drives it) holds an operator key
 * generated here, builds + signs a Memo transaction from an instruction list,
 * and submits it. Asserts: the receipt lands with status 1; on chain the
 * operator is the fee payer and only signer; the sync indexed THIS memo at the
 * receipt's slot; and the batcher refuses a forged operator signature and a
 * non-allow-listed program (a System transfer out of the operator) before
 * anything is sent.
 */
export async function runSignerBatcherTest(db: Client): Promise<void> {
  const connection = new Connection(RPC, "confirmed");
  const operator = Keypair.generate(); // never leaves this process
  const memoProgram = new PublicKey(MEMO_PROGRAM_ID);

  await assert("Signer batcher: fund the operator (fee payer + signer)", async () => {
    const sig = await connection.requestAirdrop(operator.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    return (await connection.getBalance(operator.publicKey, "confirmed")) >= LAMPORTS_PER_SOL;
  });

  const storageDir = mkdtempSync(join(tmpdir(), "e2e-solana-signer-"));
  let batcher: Batcher<DefaultBatcherInput> | null = null;
  try {
    const adapter = new SolanaSignerAdapter({
      rpcUrl: RPC,
      operatorSecretKey: bs58.encode(operator.secretKey),
      allowedProgramIds: [MEMO_PROGRAM_ID],
      syncProtocolName: "parallelSolanaRPC",
    });
    batcher = createNewBatcher<DefaultBatcherInput>(
      {
        pollingIntervalMs: 500,
        enableHttpServer: false,
        enableEventSystem: false,
        confirmationLevel: "wait-receipt",
        namespace: "e2e-solana-signer",
      },
      new FileStorage(storageDir),
    );
    batcher
      .addBlockchainAdapter(TARGET, adapter, { criteriaType: "size", maxBatchSize: 1 })
      .setDefaultTarget(TARGET);
    await batcher.init();

    const memoText = `operator-signed-memo-${Date.now()}`;
    const memoIx = new TransactionInstruction({
      programId: memoProgram,
      keys: [{ pubkey: operator.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(memoText, "utf8"),
    });
    const input = signSolanaSignerInput({
      input: { instructions: [memoIx] },
      operatorSecretKey: operator.secretKey,
      target: TARGET,
    });
    const balanceBefore = await connection.getBalance(operator.publicKey, "confirmed");

    let receiptSlot = -1;
    let signature = "";
    await assert("Signer batcher: operator-signed Memo submitted, receipt status 1", async () => {
      const receipt = await batcher!.batchInput(input, "wait-receipt", 120_000);
      if (!receipt || receipt.status !== 1) {
        console.error("[signer-batcher] receipt:", receipt);
        return false;
      }
      signature = receipt.hash;
      receiptSlot = Number(receipt.blockNumber);
      return bs58.decode(signature).length === 64 && receiptSlot > 0;
    });

    await assert("Signer batcher: on chain, the operator is fee payer and only signer", async () => {
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx || tx.meta?.err !== null) return false;
      const keys = tx.transaction.message.staticAccountKeys;
      const logs = tx.meta?.logMessages ?? [];
      return keys[0].equals(operator.publicKey) &&
        tx.transaction.signatures.length === 1 &&
        tx.slot === receiptSlot &&
        logs.some((l) => l.includes(memoText));
    });

    await assert("Signer batcher: the operator paid the fee", async () => {
      const after = await connection.getBalance(operator.publicKey, "confirmed");
      return after <= balanceBefore - 5000;
    });

    // The sync indexed THIS transaction: unique memo text, at the receipt's slot.
    await assertSQL<{ count: number }>(
      "Signer batcher: operator-signed Memo synced into solana_log_events at the receipt slot",
      db,
      `SELECT COUNT(*)::int AS count
         FROM solana_log_events
        WHERE program_id = '${MEMO_PROGRAM_ID}'
          AND slot = ${receiptSlot}
          AND log_messages::text LIKE '%${memoText}%';`,
      (res) => (res.rows[0]?.count ?? 0) >= 1,
      (res) => (res.rows[0]?.count ?? 0) === 1,
    );

    // Negative: an input signed by any key other than the operator is refused
    // (401) before validation, so nothing reaches the chain.
    await assert("Signer batcher: refuses a forged operator signature (401)", async () => {
      // A stranger's valid signature over the exact same message, claiming
      // to be the operator.
      const forgedInput = signSolanaSignerInput({
        input: { instructions: [memoIx] },
        operatorSecretKey: Keypair.generate().secretKey,
        target: TARGET,
      });
      forgedInput.address = operator.publicKey.toBase58();
      const e = await rejectionOf(batcher!.batchInput(forgedInput, "no-wait"));
      return statusOf(e) === 401;
    });

    // Negative: even operator-signed, a program outside the allow-list (here a
    // System transfer OUT of the operator) is refused (400) and never sent.
    await assert("Signer batcher: refuses a non-allow-listed program (400), nothing sent", async () => {
      const recipient = Keypair.generate().publicKey;
      const drain = SystemProgram.transfer({
        fromPubkey: operator.publicKey,
        toPubkey: recipient,
        lamports: 1_000_000,
      });
      const drainInput = signSolanaSignerInput({
        input: { instructions: [drain] },
        operatorSecretKey: operator.secretKey,
        target: TARGET,
      });
      const e = await rejectionOf(batcher!.batchInput(drainInput, "no-wait"));
      const message = e instanceof Error ? e.message : String(e);
      const recipientBalance = await connection.getBalance(recipient, "confirmed");
      return statusOf(e) === 400 && message.includes("allowedProgramIds") &&
        recipientBalance === 0;
    });
  } finally {
    if (batcher) await batcher.gracefulShutdown().catch(() => {});
    rmSync(storageDir, { recursive: true, force: true });
  }

  console.log("Solana operator-signer batcher tests passed.\n");
}
