/**
 * Deploys the test_event_contract to the NEAR sandbox and calls:
 *   - emit_event(message)       — for NEAR:Generic primitive testing
 *   - settle_intent(...)        — for NEAR:Intent primitive testing
 *
 * Writes unique per-run identifiers to build/ so E2E tests can verify exact data.
 *
 * Uses near-api-js v7 for transaction signing and submission.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

const RPC_URL = "http://localhost:3030";
const CONTRACT_ACCOUNT = "test.near";
const WASM_PATH = join(import.meta.dirname!, "test_event_contract.wasm");
const BUILD_DIR = join(import.meta.dirname!, "build");

// Read sandbox validator key — pick the most recently created sandbox dir
const tmp = tmpdir();
const sandboxDirs = readdirSync(tmp)
  .filter((d: string) => d.startsWith("near-sandbox-"))
  .map((d: string) => join(tmp, d))
  .sort((a: string, b: string) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const sandboxHome = sandboxDirs[0];
const validatorKey = JSON.parse(readFileSync(join(sandboxHome, "validator_key.json"), "utf-8"));

// Set up v7 provider + signer
const provider = new JsonRpcProvider({ url: RPC_URL });
const keyPair = KeyPair.fromString(validatorKey.secret_key);
const signer = new KeyPairSigner(keyPair);
const account = new Account(CONTRACT_ACCOUNT, provider, signer);

mkdirSync(BUILD_DIR, { recursive: true });

// ── Unique per-run identifiers ───────────────────────────────────────────

const ts = Date.now();
const MESSAGE = `effectstream-near-e2e-${ts}`;
const INTENT_HASH = `intent-${ts}`;
const INTENT_ACCOUNT = "alice.test.near";
// NEP-141 unique-per-run identifiers so the nep141 test can locate its row
// without colliding with other primitives' events.
const NEP141_FROM = `alice-${ts}.test.near`;
const NEP141_TO = `bob-${ts}.test.near`;
const NEP141_AMOUNT = `${ts}`;

// ── Step 1: Deploy contract ──────────────────────────────────────────────

console.log(`Deploying contract to ${CONTRACT_ACCOUNT}...`);
const wasmBytes = readFileSync(WASM_PATH);
await account.deployContract(wasmBytes);
console.log("Contract deployed.");

await new Promise(r => setTimeout(r, 2000));

// ── Step 2: Call emit_event (NEAR:Generic test) ──────────────────────────

console.log(`Calling emit_event("${MESSAGE}")...`);
await account.callFunction({
  contractId: CONTRACT_ACCOUNT,
  methodName: "emit_event",
  args: { message: MESSAGE },
});
console.log("emit_event completed.");

// ── Step 3: Call settle_intent (NEAR:Intent test) ────────────────────────

console.log(`Calling settle_intent(account=${INTENT_ACCOUNT}, hash=${INTENT_HASH})...`);
await account.callFunction({
  contractId: CONTRACT_ACCOUNT,
  methodName: "settle_intent",
  args: {
    account_id: INTENT_ACCOUNT,
    intent_hash: INTENT_HASH,
    token_a_id: "nep141:wrap.near",
    token_a_amount: "-5000000000000000000000000",
    token_b_id: "nep245:game.near:legendary-sword",
    token_b_amount: "1",
  },
});
console.log("settle_intent completed.");

// ── Step 4: Call emit_nep141_transfer (NEAR:NEP141 test) ─────────────────

console.log(
  `Calling emit_nep141_transfer(from=${NEP141_FROM}, to=${NEP141_TO}, amount=${NEP141_AMOUNT})...`,
);
await account.callFunction({
  contractId: CONTRACT_ACCOUNT,
  methodName: "emit_nep141_transfer",
  args: {
    old_owner_id: NEP141_FROM,
    new_owner_id: NEP141_TO,
    amount: NEP141_AMOUNT,
  },
});
console.log("emit_nep141_transfer completed.");

// ── Write test data for E2E verification ─────────────────────────────────

writeFileSync(join(BUILD_DIR, "test-message.txt"), MESSAGE);
writeFileSync(join(BUILD_DIR, "intent-hash.txt"), INTENT_HASH);
writeFileSync(join(BUILD_DIR, "intent-account.txt"), INTENT_ACCOUNT);
writeFileSync(join(BUILD_DIR, "nep141-from.txt"), NEP141_FROM);
writeFileSync(join(BUILD_DIR, "nep141-to.txt"), NEP141_TO);
writeFileSync(join(BUILD_DIR, "nep141-amount.txt"), NEP141_AMOUNT);
console.log(`Test data written to ${BUILD_DIR}`);
