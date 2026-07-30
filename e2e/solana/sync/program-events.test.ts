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
import type { Client } from "pg";
import {
  createEmitInstruction,
  EVENT_PREFIX,
  TEST_EVENT_PROGRAM,
  TEST_EVENT_PROGRAM_ID,
} from "@e2e/solana-contracts";

const RPC = "http://localhost:8899";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** Distinct values so each assertion can find its own event unambiguously. */
const GENUINE_VALUE = 4242;
const SPOOFED_VALUE = 9999;

/**
 * Exercises SOLANA:ProgramLog against the real custom program from
 * e2e/shared/contracts/solana, which the validator loads into genesis at a fixed
 * address. Two halves, and the second is the point:
 *
 *  1. A genuine invocation is captured, and the payload carries only the
 *     program's OWN log lines.
 *  2. A transaction that merely *references* the program's id as an account —
 *     while a different program emits the exact marker string — is NOT
 *     attributed to it.
 *
 * (2) is the end-to-end regression test for the log-spoofing fix. Before it,
 * the primitive gated on `accountKeys.includes(programId)` plus a substring
 * match over every log line in the transaction, so any program could forge an
 * event against any watched program id.
 */
export async function runProgramEventTests(db: Client): Promise<void> {
  const connection = new Connection(RPC, "confirmed");
  const user = Keypair.generate();

  await assert("TestEvent: fund the caller", async () => {
    const sig = await connection.requestAirdrop(user.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    return (await connection.getBalance(user.publicKey, "confirmed")) > 0;
  });

  await assert("TestEvent: program is loaded and executable", async () => {
    const info = await connection.getAccountInfo(TEST_EVENT_PROGRAM, "confirmed");
    return info !== null && info.executable;
  });

  // ── 1. Genuine invocation ────────────────────────────────────────────────
  await assert("TestEvent: emit() succeeds and logs the marker", async () => {
    const tx = new Transaction().add(
      createEmitInstruction(user.publicKey, GENUINE_VALUE),
    );
    const sig = await connection.sendTransaction(tx, [user], {
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");

    const parsed = await connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = parsed?.meta?.logMessages ?? [];
    return logs.some((l) => l.includes(`${EVENT_PREFIX}|${user.publicKey.toBase58()}|${GENUINE_VALUE}`));
  });

  await assertSQL<{ count: number }>(
    "TestEvent: sync captured the genuine event for the test program",
    db,
    `SELECT COUNT(*)::int AS count
       FROM solana_log_events
      WHERE program_id = '${TEST_EVENT_PROGRAM_ID}'
        AND log_messages::text LIKE '%${EVENT_PREFIX}|${user.publicKey.toBase58()}|${GENUINE_VALUE}%';`,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
  );

  // The payload must hold the program's own lines only — not every line in the
  // transaction. The invoke/success framing and the compute-unit metering line
  // belong to the runtime, not to the program.
  await assertSQL<{ log_messages: string }>(
    "TestEvent: payload carries only the program's own log lines",
    db,
    `SELECT log_messages::text AS log_messages
       FROM solana_log_events
      WHERE program_id = '${TEST_EVENT_PROGRAM_ID}'
        AND log_messages::text LIKE '%${GENUINE_VALUE}%'
      LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const logs = res.rows[0]?.log_messages ?? "";
      return logs.includes(EVENT_PREFIX) &&
        !logs.includes("invoke [") &&
        !logs.includes("compute units");
    },
  );

  // ── 2. Spoof attempt ─────────────────────────────────────────────────────
  // The attacker's transaction:
  //   - transfers 1 lamport TO the watched program's address, which puts that
  //     id in `accountKeys` without invoking anything, and
  //   - emits the marker string from the SPL Memo program.
  // Under the old attribution logic this forged an event against the watched
  // program with an attacker-chosen payload.
  await assert("TestEvent: spoof tx (memo + bare account ref) is accepted on-chain", async () => {
    const attacker = Keypair.generate();
    const sig0 = await connection.requestAirdrop(attacker.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig0, "confirmed");

    const spoofText = `${EVENT_PREFIX}|${attacker.publicKey.toBase58()}|${SPOOFED_VALUE}`;
    const tx = new Transaction()
      .add(SystemProgram.transfer({
        fromPubkey: attacker.publicKey,
        toPubkey: TEST_EVENT_PROGRAM, // present as an account; never invoked
        lamports: 1,
      }))
      .add(new TransactionInstruction({
        keys: [{ pubkey: attacker.publicKey, isSigner: true, isWritable: false }],
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from(spoofText, "utf8"),
      }));

    const sig = await connection.sendTransaction(tx, [attacker], {
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");

    // Sanity: the marker really is in this transaction's logs, and the watched
    // program really is in its account list — otherwise the negative assertion
    // below would pass for the wrong reason.
    const parsed = await connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = parsed?.meta?.logMessages ?? [];
    const keys = (parsed?.transaction.message.staticAccountKeys ?? [])
      .map((k) => k.toBase58());
    return logs.some((l) => l.includes(spoofText)) &&
      keys.includes(TEST_EVENT_PROGRAM_ID);
  });

  // Wait for the sync to move past that slot, so "no row" means "processed and
  // correctly rejected" rather than "not caught up yet". The Memo primitive
  // watches the same transaction, so its row landing proves the slot was synced.
  await assertSQL<{ count: number }>(
    "TestEvent: the spoof tx's slot has been synced (memo primitive saw it)",
    db,
    `SELECT COUNT(*)::int AS count
       FROM solana_log_events
      WHERE program_id = '${MEMO_PROGRAM_ID}'
        AND log_messages::text LIKE '%${SPOOFED_VALUE}%';`,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
  );

  await assertSQL<{ count: number }>(
    "TestEvent: NO event attributed to the test program from the spoof tx",
    db,
    `SELECT COUNT(*)::int AS count
       FROM solana_log_events
      WHERE program_id = '${TEST_EVENT_PROGRAM_ID}'
        AND log_messages::text LIKE '%${SPOOFED_VALUE}%';`,
    (res) => (res.rows[0]?.count ?? 0) === 0,
    (res) => (res.rows[0]?.count ?? 0) === 0,
  );

  console.log("Solana test-program event tests passed.\n");
}
