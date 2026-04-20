/**
 * Bitcoin E2E Test Runner
 *
 * 1. Starts infrastructure via orchestrator-v2/cli.ts (DB + Bitcoin Core + sync node)
 * 2. Waits for services to be ready
 * 3. Runs tooling tests (verify Bitcoin Core infrastructure)
 * 4. Runs sync tests (verify STM wrote correct values to DB)
 * 5. Runs batcher tests (verify batcher can submit Bitcoin transactions)
 * 6. Shuts down everything
 */
import {
  anyError,
  printSummary,
  startInfrastructure,
  stopInfrastructure,
  waitForOrchestrator,
  waitForProcess,
  waitForHealth,
  getDBConnection,
  waitForBlock,
} from "@e2e-v2/engine";
import { assert, assertSQL } from "@e2e-v2/engine";
import path from "path";
import type { Client } from "pg";

import * as bitcoin from "bitcoinjs-lib";
import * as ecpair from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { buildBitcoinSignatureMessage } from "@effectstream/batcher";

const LAUNCHER = path.resolve(import.meta.dirname!, "./launcher.cli.ts");
const BTC_RPC = "http://127.0.0.1:18443";
const BTC_AUTH = "Basic " + btoa("dev:devpassword");

const ECPair = ecpair.ECPairFactory(tinysecp);

// bitcoinjs-message pulls in the `secp256k1` native addon, which segfaults on
// dlopen under bun (missing node::Buffer::HasInstance — see bun#4290). We only
// need the sign side here, so we reimplement it with pure-JS @noble/secp256k1.
secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

function bitcoinSignedMessageHash(message: string): Uint8Array {
  const prefix = Buffer.from("\x18Bitcoin Signed Message:\n", "utf8");
  const msg = Buffer.from(message, "utf8");
  const len = msg.length;
  let varint: Buffer;
  if (len < 0xfd) varint = Buffer.from([len]);
  else if (len <= 0xffff) { varint = Buffer.alloc(3); varint[0] = 0xfd; varint.writeUInt16LE(len, 1); }
  else { varint = Buffer.alloc(5); varint[0] = 0xfe; varint.writeUInt32LE(len, 1); }
  return sha256(sha256(Buffer.concat([prefix, varint, msg])));
}

function signBitcoinMessage(message: string, privateKey: Uint8Array, compressed: boolean): Buffer {
  // @noble/secp256k1 v3 'recovered' layout: [rec(1) r(32) s(32)].
  const rec = secp.sign(bitcoinSignedMessageHash(message), privateKey, {
    lowS: true,
    prehash: false,
    format: "recovered",
  });
  // bitcoinjs-message wire format: [flag(1) r(32) s(32)], flag = 27 + rec + (compressed ? 4 : 0).
  // Verifier is invoked with checkSegwitAlways=true, so the legacy flag is accepted for P2WPKH.
  const flag = 27 + rec[0]! + (compressed ? 4 : 0);
  return Buffer.concat([Buffer.from([flag]), Buffer.from(rec.slice(1, 65))]);
}

// ── Bitcoin RPC helper ────────────────────────────────────────────────────────

async function btcRpc(method: string, params: any[] = [], wallet?: string) {
  const url = wallet ? `${BTC_RPC}/wallet/${wallet}` : BTC_RPC;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: BTC_AUTH },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

// ── sendBitcoin helper ────────────────────────────────────────────────────────

interface BatcherResponse {
  success: boolean;
  message: string;
  inputsProcessed: number;
  transactionHash?: string;
  rollup?: number;
}

interface BitcoinRequest {
  toAddress: string;
  amountSats: number;
}

function buildBitcoinRequest(
  privateKeyWIF: string,
  payload: BitcoinRequest,
  network: bitcoin.Network,
  target: string,
  mutateSignature?: (sig: Buffer) => Buffer,
): { data: Record<string, unknown> } {
  const keyPair = ECPair.fromWIF(privateKeyWIF, network);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
  if (!address) throw new Error("Could not derive address from private key");

  const timestamp = new Date().toISOString();
  const message = buildBitcoinSignatureMessage(payload, timestamp);
  let sigBuf = signBitcoinMessage(message, keyPair.privateKey!, keyPair.compressed);
  if (mutateSignature) sigBuf = mutateSignature(sigBuf);

  return {
    data: {
      address,
      input: JSON.stringify(payload),
      signature: sigBuf.toString("base64"),
      timestamp,
      target,
      addressType: -1,
    },
  };
}

async function sendBitcoinRaw(
  privateKeyWIF: string,
  payload: BitcoinRequest,
  confirmationLevel: "no-wait" | "wait-receipt" | "wait-effectstream-processed" = "no-wait",
  network: bitcoin.Network = bitcoin.networks.regtest,
  target: string = "bitcoin",
  mutateSignature?: (sig: Buffer) => Buffer,
): Promise<{ status: number; body: any }> {
  const req = buildBitcoinRequest(privateKeyWIF, payload, network, target, mutateSignature);
  const response = await fetch("http://localhost:3334/send-input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, confirmationLevel }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function sendBitcoin(
  privateKeyWIF: string,
  payload: BitcoinRequest,
  confirmationLevel: "no-wait" | "wait-receipt" | "wait-effectstream-processed" = "no-wait",
  network: bitcoin.Network = bitcoin.networks.regtest,
  target: string = "bitcoin"
): Promise<BatcherResponse> {
  const { status, body } = await sendBitcoinRaw(privateKeyWIF, payload, confirmationLevel, network, target);
  if (status < 200 || status >= 300) {
    throw new Error(`Failed to send Bitcoin transaction: ${status} ${JSON.stringify(body)}`);
  }
  return body as BatcherResponse;
}

// ── Phase 1: Tooling Tests ────────────────────────────────────────────────────

async function toolingTests() {
  console.log("\n--- Phase 1: Tooling Tests (infrastructure validation) ---\n");

  await assert("Bitcoin Core RPC responds", async () => {
    const info = await btcRpc("getblockchaininfo");
    return info.chain === "regtest";
  });

  await assert("Bitcoin blocks mined (height > 100)", async () => {
    const info = await btcRpc("getblockchaininfo");
    return info.blocks > 100;
  });
}

// ── Phase 2: Sync Tests ──────────────────────────────────────────────────────

async function syncTests(db: Client) {
  console.log("\n--- Phase 2: Sync Tests (STM value validation) ---\n");
  // Bitcoin sync has delayMs=20000, so we need a longer assertSQL timeout
  process.env["E2E_MAX_TIMEOUT"] = "120000";

  // The watch address should have received transactions from the block generator.
  // Wait for sync to catch up and process the bitcoin transactions.
  await assertSQL<{ address: string; direction: string; value_sats: string }>(
    "Bitcoin: transactions for watch address indexed in DB",
    db,
    `SELECT address, direction, value_sats
     FROM bitcoin_transactions
     WHERE address = 'bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03'
     ORDER BY id ASC;`,
    (res) => res.rows.length > 0,
    (res) => {
      const row = res.rows[0];
      return (
        row.address === "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03" &&
        BigInt(row.value_sats) > 0n
      );
    },
  );
}

// ── Phase 3: Batcher Tests ──────────────────────────────────────────────────

async function batcherTests(db: Client) {
  console.log("\n--- Phase 3: Batcher Tests (Bitcoin batcher submission) ---\n");

  // Send to the same watched address (see config.ts:86) so the output flows
  // through the sync node's STM and lands in the bitcoin_transactions table —
  // gives us a visible end-to-end round-trip: sign → batcher → broadcast →
  // mined → sync node → STM → DB.
  const WATCHED = "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03";
  const BATCHER_AMOUNT = 10000;

  await assert("Bitcoin batcher submits transaction successfully", async () => {
    const payload: BitcoinRequest = {
      toAddress: WATCHED,
      amountSats: BATCHER_AMOUNT,
    };

    const result = await sendBitcoin(
      "cPNCP9RTgYu6aqw4cTFQgrrTKkz6oJPUnxuYeaDrWR5wAkDqwHjc",
      payload,
      "wait-effectstream-processed"
    );
    console.log("Batcher result:", result);
    return result.success === true;
  });

  await assertSQL<{ value_sats: string }>(
    `Bitcoin: batcher output (${BATCHER_AMOUNT} sats → ${WATCHED}) indexed by STM`,
    db,
    `SELECT value_sats
     FROM bitcoin_transactions
     WHERE address = '${WATCHED}'
       AND direction = 'output'
       AND value_sats = ${BATCHER_AMOUNT};`,
    (res) => res.rows.length > 0,
    (res) => BigInt(res.rows[0]!.value_sats) === BigInt(BATCHER_AMOUNT),
  );
}

// ── Phase 4: Batcher Feature Tests ───────────────────────────────────────────

async function batcherFeatureTests(db: Client) {
  console.log("\n--- Phase 4: Batcher Feature Tests (behavioral correctness) ---\n");

  const WATCHED = "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03";
  const WIF = "cPNCP9RTgYu6aqw4cTFQgrrTKkz6oJPUnxuYeaDrWR5wAkDqwHjc";

  // Test: Batching coalescence. The batcher's hybrid criteria flushes whenever
  // `timeSinceLastBatch >= timeWindowMs (1s)` AND the queue is non-empty, so a
  // single queued input will flush alone on the next tick. To observe batching,
  // we fire N inputs sequentially (parallel calls race on scantxoutset) and
  // assert that at least ONE pair ended up in the same Bitcoin tx.
  //
  // Sequential is required because BitcoinAdapter.validateInput awaits
  // scantxoutset, which Bitcoin Core serializes — concurrent calls fail.
  const COALESCE_AMOUNTS = [40001, 40002, 40003, 40004];

  await assert(
    `Bitcoin batcher: ${COALESCE_AMOUNTS.length} PARALLEL inputs all accepted`,
    async () => {
      const results = await Promise.all(
        COALESCE_AMOUNTS.map((amountSats) =>
          sendBitcoin(WIF, { toAddress: WATCHED, amountSats }, "no-wait"),
        ),
      );
      return results.every((r) => r.success === true);
    },
  );

  await assertSQL<{ transaction_id: string; count: string }>(
    `Bitcoin batcher: at least one pair among {${COALESCE_AMOUNTS.join(", ")}} coalesced into a single tx`,
    db,
    `SELECT transaction_id, COUNT(*)::text AS count
     FROM bitcoin_transactions
     WHERE address = '${WATCHED}'
       AND direction = 'output'
       AND value_sats IN (${COALESCE_AMOUNTS.join(", ")})
     GROUP BY transaction_id
     HAVING COUNT(*) >= 2
     ORDER BY COUNT(*) DESC;`,
    (res) => res.rows.length >= 1,
    (res) => Number(res.rows[0]!.count) >= 2,
  );

  // Test: Time-window flush — a single input (below maxBatchSize of 5) must still
  // be flushed by the 1s time window, proving the scheduler fires on timer alone.
  // Uses `no-wait` so the server returns immediately without blocking on receipt,
  // then we observe the DB for the row.
  const FLUSH_AMOUNT = 12345;

  await assert("Bitcoin batcher: no-wait returns immediately for single input", async () => {
    const start = Date.now();
    const res = await sendBitcoin(WIF, { toAddress: WATCHED, amountSats: FLUSH_AMOUNT }, "no-wait");
    const elapsed = Date.now() - start;
    return res.success === true && elapsed < 5_000;
  });

  await assertSQL<{ value_sats: string }>(
    `Bitcoin batcher: single input (${FLUSH_AMOUNT} sats) flushed by time-window and indexed`,
    db,
    `SELECT value_sats
     FROM bitcoin_transactions
     WHERE address = '${WATCHED}'
       AND direction = 'output'
       AND value_sats = ${FLUSH_AMOUNT};`,
    (res) => res.rows.length > 0,
    (res) => BigInt(res.rows[0]!.value_sats) === BigInt(FLUSH_AMOUNT),
  );

  // Test: Signature rejection — a request with a tampered signature must be rejected
  // at the HTTP boundary (no row in DB with this amount, no storage growth).
  const REJECT_AMOUNT = 33333;

  await assert("Bitcoin batcher: tampered signature rejected at HTTP boundary", async () => {
    const { status, body } = await sendBitcoinRaw(
      WIF,
      { toAddress: WATCHED, amountSats: REJECT_AMOUNT },
      "no-wait",
      bitcoin.networks.regtest,
      "bitcoin",
      // Flip the last byte of the signature — ECDSA s-component altered.
      (sig) => {
        const tampered = Buffer.from(sig);
        tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
        return tampered;
      },
    );
    const rejected = status >= 400 || body?.success === false;
    if (!rejected) console.error("[UNEXPECTED]", status, body);
    return rejected;
  });

  // Allow time for a poll cycle — if the input were wrongly accepted it would
  // have been submitted by now. Then assert the DB has no row with that amount.
  await new Promise((r) => setTimeout(r, 3000));
  await assertSQL<{ count: string }>(
    `Bitcoin batcher: no tx with tampered amount (${REJECT_AMOUNT}) reached the chain`,
    db,
    `SELECT COUNT(*)::text AS count
     FROM bitcoin_transactions
     WHERE address = '${WATCHED}'
       AND direction = 'output'
       AND value_sats = ${REJECT_AMOUNT};`,
    (res) => res.rows.length > 0,
    (res) => res.rows[0]!.count === "0",
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function test() {
  let db: Client | null = null;
  try {
    // 1. Start infrastructure
    await startInfrastructure(LAUNCHER);
    await waitForOrchestrator();

    // 2. Wait for Bitcoin Core + blocks mined
    await waitForProcess("bitcoin-wait-for-block", { waitForExit: true, timeoutMs: 600_000 });
    console.log("Bitcoin infrastructure ready.\n");

    // 3. Run tooling tests (verify infra BEFORE sync)
    await toolingTests();

    // 4. Wait for sync node to be healthy
    await waitForProcess("sync");
    await waitForHealth();
    await waitForBlock(1);
    console.log("Sync node healthy.\n");

    // 5. Connect to DB and run sync tests
    db = getDBConnection();
    await syncTests(db);

    // 6. Run batcher tests
    await batcherTests(db);

    // 7. Run batcher feature tests (behavioral correctness)
    await batcherFeatureTests(db);

    // 8. Summary
    printSummary();
  } catch (e) {
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfrastructure();
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

test();
