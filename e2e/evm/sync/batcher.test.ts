/**
 * EVM Batcher Sync Test
 *
 * Tests the full batcher flow:
 *
 * 1. EffectstreamL2 batcher: sign message with EVM wallet -> POST /send-input
 *    -> batcher batches it -> submits to EffectstreamL2 contract on-chain
 *    -> sync picks up -> verify in primitive_accounting
 *
 * 2. Counter batcher: POST /send-input with target=evmCounter
 *    -> batcher calls incrementCounter() on Counter contract
 *    -> sync picks up changedCount event -> verify in primitive_accounting
 *
 * 3. Bad signature rejection: send message with wrong signature
 *    -> batcher rejects it -> verify it does NOT appear in primitive_accounting
 */
import { assert, assertSQL, type SharedState } from "@e2e/engine";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { AddressType } from "@effectstream/utils";
import { createMessageForBatcher } from "@effectstream/concise";
import type { Client } from "pg";

const BATCHER_PORT = parseInt(process.env["BATCHER_PORT"] || "3334", 10);
const BATCHER_URL = `http://localhost:${BATCHER_PORT}/send-input`;

async function waitBlocks(n: number) {
  await new Promise((r) => setTimeout(r, n * 300));
}

export async function batcherSyncTest(db: Client, sharedState: SharedState) {
  // Create a fresh random wallet for batcher tests
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(),
  });

  // ── Test 1: EffectstreamL2 batcher (default target) ────────────────────────────

  const timestamp = Date.now().toString();
  const conciseInput = JSON.stringify(["add", "200", "55"]);

  const signature = await walletClient.signMessage({
    message: createMessageForBatcher(
      null,
      timestamp,
      account.address,
      AddressType.EVM,
      conciseInput,
      undefined,
    ),
  });

  const batcherResponse = await fetch(BATCHER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        address: account.address,
        addressType: AddressType.EVM,
        input: conciseInput,
        signature,
        timestamp,
      },
      confirmationLevel: "wait-effectstream-processed",
    }),
  });

  sharedState.primitive_accounting_counter += 1;

  await assert("Batcher: EffectstreamL2 send-input returns OK", async () => {
    return batcherResponse.ok;
  });

  // Verify the batched input arrived in primitive_accounting with parsed data ["add","200","55"]
  await assertSQL<{ primitive_name: string; payload: any }>(
    "Batcher: EffectstreamL2 input ['add','200','55'] indexed via batcher",
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting
     WHERE primitive_name = 'EffectstreamGameInteraction'
     ORDER BY id DESC LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const p = res.rows[0].payload;
      const d = p.data || p;
      return JSON.stringify(d) === JSON.stringify(["add", "200", "55"]);
    },
  );

  // ── Test 2: Bad signature rejection ──────────────────────────────────────

  const countBefore = sharedState.primitive_accounting_counter;
  const badSignature = await walletClient.signMessage({ message: "bad-message" });

  await fetch(BATCHER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        address: account.address,
        addressType: AddressType.EVM,
        input: conciseInput,
        signature: badSignature,
        timestamp,
      },
    }),
  });

  // Wait a bit and verify count didn't increase
  await waitBlocks(5);

  await assertSQL<{ cnt: string }>(
    "Batcher: bad signature message NOT indexed",
    db,
    `SELECT COUNT(*)::text as cnt FROM effectstream.primitive_accounting;`,
    (res) => true,
    (res) => parseInt(res.rows[0].cnt) === countBefore,
  );

  // ── Test 3: Counter batcher (evmCounter target) ──────────────────────────

  const counterTimestamp = Date.now().toString();
  const counterPayload = JSON.stringify({ method: "incrementCounter", args: [] });

  const counterSignature = await walletClient.signMessage({
    message: createMessageForBatcher(
      null,
      counterTimestamp,
      account.address,
      AddressType.EVM,
      counterPayload,
      "evmCounter",
    ),
  });

  const counterResponse = await fetch(BATCHER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        address: account.address,
        addressType: AddressType.EVM,
        input: counterPayload,
        signature: counterSignature,
        timestamp: counterTimestamp,
        target: "evmCounter",
      },
      confirmationLevel: "wait-effectstream-processed",
    }),
  });

  sharedState.primitive_accounting_counter += 1;

  await assert("Batcher: Counter send-input returns OK", async () => {
    return counterResponse.ok;
  });

  // Verify the counter was incremented via batcher
  await assertSQL<{ primitive_name: string; payload: any }>(
    "Batcher: Counter incrementCounter() via batcher indexed",
    db,
    `SELECT primitive_name, payload FROM effectstream.primitive_accounting
     WHERE primitive_name = 'Counter'
     ORDER BY id DESC LIMIT 1;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const p = res.rows[0].payload;
      const counter = p.counter ?? p.data?.counter;
      // The counter value should be > 0 (exact value depends on prior tests)
      return typeof counter === "number" && counter > 0;
    },
  );

  // ── Test 4: Nonce tracking ───────────────────────────────────────────────
  // The batcher wallet sent valid batched messages.
  // Nonce entries are stored as "address-timestamp" in the nonce column.
  await assertSQL<{ nonce: string; block_height: number }>(
    "Batcher: nonces tracked for batched messages",
    db,
    `SELECT * FROM effectstream.nonces;`,
    (res) => res.rows.length >= 1,
    (res) => {
      // At least one nonce entry should contain the batcher wallet address
      const addr = account.address.toLowerCase();
      return res.rows.some(
        (r: any) => r.nonce.startsWith(addr)
      );
    },
  );
}
