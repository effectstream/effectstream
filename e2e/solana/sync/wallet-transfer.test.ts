import { assert } from "@e2e/engine";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { WATCHED_BALANCE_ADDRESS } from "../config.ts";

const RPC = "http://localhost:8899";

/**
 * Level 1 validation: create a wallet, send a real transaction, and read it
 * back off the chain — all via JSON-RPC against the local validator.
 * The transfer touches the System Program (1111…), so it also produces the
 * on-chain activity the sync-pipeline assertion (program-logs.test.ts) reads.
 *
 * Returns the recipient address so callers can assert on it downstream.
 */
export async function runWalletTransferTest(): Promise<{ recipient: string }> {
  const connection = new Connection(RPC, "confirmed");
  const payer = Keypair.generate();
  const recipient = Keypair.generate();
  let transferSig = "";

  await assert("Solana: airdrop funds a freshly created wallet", async () => {
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");
    const balance = await connection.getBalance(payer.publicKey, "confirmed");
    return balance >= 2 * LAMPORTS_PER_SOL;
  });

  await assert("Solana: wallet sends a SystemProgram.transfer", async () => {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient.publicKey,
        lamports: LAMPORTS_PER_SOL,
      }),
    );
    transferSig = await sendAndConfirmTransaction(connection, tx, [payer]);
    return transferSig.length > 0;
  });

  await assert("Solana: recipient balance reflects the transfer", async () => {
    const balance = await connection.getBalance(recipient.publicKey, "confirmed");
    return balance === LAMPORTS_PER_SOL;
  });

  await assert("Solana: transfer is readable back from the chain", async () => {
    const sigs = await connection.getSignaturesForAddress(
      recipient.publicKey,
      { limit: 5 },
      "confirmed",
    );
    return sigs.some((s) => s.signature === transferSig);
  });

  // Fund the fixed address the AccountBalance primitive watches, so the sync
  // pipeline captures a balance event for it (asserted in account-balance.test).
  await assert("Solana: airdrop to the watched balance address", async () => {
    const watched = new PublicKey(WATCHED_BALANCE_ADDRESS);
    const sig = await connection.requestAirdrop(watched, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    return (await connection.getBalance(watched, "confirmed")) >= 2 * LAMPORTS_PER_SOL;
  });

  console.log("Solana wallet/transfer/read tests passed.\n");
  return { recipient: recipient.publicKey.toBase58() };
}
