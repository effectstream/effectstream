import { assert, assertSQL } from "../helpers.ts";
import { Keypair, PublicKey, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import bs58 from "bs58";
import type { Client } from "pg";
import {
  COUNTER_PROGRAM_ID,
  createIncrementInstruction,
  DEV_RPC_URL,
  DEV_BATCHER_URL,
  DEV_BATCHER_FEE_PAYER,
  DEV_BATCHER_TARGET,
} from "@solana-starter/contracts-solana";

const RPC_URL = DEV_RPC_URL;
const BATCHER_URL = DEV_BATCHER_URL;
export const BATCHER_FEE_PAYER = DEV_BATCHER_FEE_PAYER;

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

async function sendIncrementFromKeypair(
  user: Keypair,
  amount: number,
): Promise<void> {
  const authority = user.publicKey;
  const feePayer = new PublicKey(BATCHER_FEE_PAYER);

  const ix = createIncrementInstruction(authority, amount, feePayer);
  const tx = new Transaction({
    feePayer,
    recentBlockhash: (await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]))
      .value.blockhash,
  });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }));
  tx.add(ix);

  // User partially signs; the fee-payer (batcher sponsor) has NOT signed yet —
  // it adds its signature on its side. The base64 wire format is what the
  // fee-payer-sponsor SolanaAdapter expects (it verifies the user's tx
  // signature directly via tx.verifySignatures, not a canonical message).
  tx.partialSign(user);
  const base64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
  const userSig = tx.signatures.find((s) => s.publicKey.equals(authority))?.signature;
  const signature = userSig ? bs58.encode(userSig) : "";

  const res = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        target: DEV_BATCHER_TARGET,
        // AddressType.SOLANA = 9 ( see @effectstream/utils ).
        addressType: 9,
        address: authority.toBase58(),
        signature,
        input: base64,
        timestamp: Date.now().toString(),
      },
      confirmationLevel: "wait-effectstream-processed",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batcher /send-input ${res.status}: ${text}`);
  }
}

export async function submitCounterTest(
  db: Client,
): Promise<{ address: string; value: number }> {
  const user = Keypair.generate();
  const userAddr = user.publicKey.toBase58();
  console.log(`  [info] submitting as fresh keypair ${userAddr.slice(0, 8)}…`);

  // No airdrop: the user is a brand-new keypair with 0 SOL. The batcher funds
  // both fees and the PDA rent, so the whole flow must work feeless.
  await assert("fresh user starts with zero SOL", async () => {
    const bal = await rpc("getBalance", [userAddr]);
    return (bal?.value ?? 0) === 0;
  });

  await assert("first counter increment ( +7 ) submitted through batcher", async () => {
    await sendIncrementFromKeypair(user, 7);
    return true;
  });

  await assertSQL<{ value: string }>(
    "counter_state row created with value=7 after first increment",
    db,
    `SELECT value FROM counter_state WHERE authority = '${userAddr}';`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].value === "7",
    60_000,
  );

  await assert("second counter increment ( +3 ) submitted through batcher", async () => {
    await sendIncrementFromKeypair(user, 3);
    return true;
  });

  await assertSQL<{ value: string }>(
    "counter_state updated to cumulative value=10 after second increment",
    db,
    `SELECT value FROM counter_state WHERE authority = '${userAddr}';`,
    (res) => res.rows.length >= 1 && res.rows[0].value === "10",
    (res) => res.rows[0].value === "10",
    60_000,
  );

  await assertSQL<{ kind: string }>(
    "counter_events has rows for both increments",
    db,
    `SELECT kind FROM counter_events WHERE authority = '${userAddr}' ORDER BY id;`,
    (res) => res.rows.length >= 2,
    (res) => res.rows.length >= 2,
    30_000,
  );

  await assert("user still has zero SOL after two increments ( fully feeless )", async () => {
    const bal = await rpc("getBalance", [userAddr]);
    return (bal?.value ?? 0) === 0;
  });

  return { address: userAddr, value: 10 };
}
