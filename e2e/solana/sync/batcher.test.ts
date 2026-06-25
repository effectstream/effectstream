import { assert, assertSQL } from "@e2e/engine";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { AddressType } from "@effectstream/utils";
import type { Client } from "pg";
import { MEMO_PROGRAM_ID, SPONSOR_ADDRESS } from "../batcher/adapter-solana.ts";

const RPC = "http://localhost:8899";
const BATCHER_PORT = parseInt(process.env["BATCHER_PORT"] || "3334", 10);
const BATCHER_URL = `http://localhost:${BATCHER_PORT}/send-input`;

function postInput(address: string, base64Tx: string, signature: string) {
  return fetch(BATCHER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        address,
        addressType: AddressType.SOLANA,
        input: base64Tx,
        signature,
        timestamp: Date.now().toString(),
      },
    }),
  });
}

/**
 * Fee-payer sponsor batcher, end-to-end: the user builds + partially signs a
 * Memo tx whose fee payer is the batcher's sponsor, POSTs it to the batcher,
 * which validates (per-program scope), co-signs as fee payer, and submits.
 * Asserts: accepted, the user paid 0 / sponsor paid, the write synced, and a
 * non-target-program instruction is rejected.
 */
export async function runBatcherTest(db: Client): Promise<void> {
  const connection = new Connection(RPC, "confirmed");
  const sponsor = new PublicKey(SPONSOR_ADDRESS);
  const memoProgram = new PublicKey(MEMO_PROGRAM_ID);

  // Fund the sponsor so it can pay fees.
  await assert("Batcher: fund the sponsor (fee payer)", async () => {
    const sig = await connection.requestAirdrop(sponsor, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    return (await connection.getBalance(sponsor, "confirmed")) >= LAMPORTS_PER_SOL;
  });

  const user = Keypair.generate(); // zero SOL — gasless
  const sponsorBefore = await connection.getBalance(sponsor, "confirmed");

  // User builds + partially signs a Memo tx with the sponsor as fee payer.
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const memoIx = new TransactionInstruction({
    keys: [{ pubkey: user.publicKey, isSigner: true, isWritable: false }],
    programId: memoProgram,
    data: Buffer.from(`gasless-action-${Date.now()}`, "utf8"),
  });
  const tx = new Transaction();
  tx.feePayer = sponsor;
  tx.recentBlockhash = blockhash;
  tx.add(memoIx);
  tx.partialSign(user);
  const base64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
  const userSig = bs58.encode(
    tx.signatures.find((s) => s.publicKey.equals(user.publicKey))!.signature!,
  );

  await assert("Batcher: sponsor accepts + submits the gasless Memo tx", async () => {
    const res = await postInput(user.publicKey.toBase58(), base64, userSig);
    return res.ok;
  });

  // The sync picked up the sponsored Memo write (poll until sync catches up).
  await assertSQL<{ count: number }>(
    "Batcher: sponsored Memo tx synced into solana_log_events",
    db,
    `SELECT COUNT(*)::int AS count FROM solana_log_events WHERE program_id = '${MEMO_PROGRAM_ID}';`,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
  );

  // By now the tx confirmed: the user paid nothing; the sponsor paid the fee.
  await assert("Batcher: user paid 0 (gasless), sponsor paid the fee", async () => {
    const userBal = await connection.getBalance(user.publicKey, "confirmed");
    const sponsorAfter = await connection.getBalance(sponsor, "confirmed");
    return userBal === 0 && sponsorAfter < sponsorBefore;
  });

  // Negative: a tx whose instruction targets a different program (System) must
  // be rejected by the per-program scoping.
  await assert("Batcher: rejects a tx that calls a non-target program", async () => {
    const { blockhash: bh } = await connection.getLatestBlockhash("confirmed");
    const badTx = new Transaction();
    badTx.feePayer = sponsor;
    badTx.recentBlockhash = bh;
    badTx.add(SystemProgram.transfer({
      fromPubkey: user.publicKey,
      toPubkey: sponsor,
      lamports: 1,
    }));
    badTx.partialSign(user);
    const badB64 = badTx.serialize({ requireAllSignatures: false }).toString("base64");
    const res = await postInput(user.publicKey.toBase58(), badB64, "n/a");
    return !res.ok; // structural validation rejects it
  });

  console.log("Solana batcher tests passed.\n");
}
