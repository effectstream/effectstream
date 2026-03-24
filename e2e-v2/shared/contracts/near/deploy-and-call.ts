/**
 * Deploys the test_event_contract to the NEAR sandbox and calls emit_event
 * with a unique timestamped message so the E2E test can verify exact data.
 *
 * Uses near-api-js v7 for transaction signing and submission.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

const RPC_URL = "http://localhost:3030";
const CONTRACT_ACCOUNT = "test.near";
const WASM_PATH = join(import.meta.dirname!, "test_event_contract.wasm");
const MESSAGE_FILE = join(import.meta.dirname!, "build", "test-message.txt");

// Read sandbox validator key
const sandboxDirs = (await import("fs")).readdirSync("/tmp")
  .filter((d: string) => d.startsWith("near-sandbox-"))
  .map((d: string) => `/tmp/${d}`);
const sandboxHome = sandboxDirs[sandboxDirs.length - 1];
const validatorKey = JSON.parse(readFileSync(join(sandboxHome, "validator_key.json"), "utf-8"));

// Set up v7 provider + signer
const provider = new JsonRpcProvider({ url: RPC_URL });
const keyPair = KeyPair.fromString(validatorKey.secret_key);
const signer = new KeyPairSigner(keyPair);
const account = new Account(CONTRACT_ACCOUNT, provider, signer);

// ── Main ──────────────────────────────────────────────────────────────────

const MESSAGE = "effectstream-near-e2e-" + Date.now();

// Step 1: Deploy contract
console.log(`Deploying contract to ${CONTRACT_ACCOUNT}...`);
const wasmBytes = readFileSync(WASM_PATH);
await account.deployContract(wasmBytes);
console.log("Contract deployed.");

// Wait for deploy to finalize
await new Promise(r => setTimeout(r, 2000));

// Step 2: Call emit_event with the unique message
console.log(`Calling emit_event("${MESSAGE}")...`);
await account.callFunction({
  contractId: CONTRACT_ACCOUNT,
  methodName: "emit_event",
  args: { message: MESSAGE },
});
console.log("emit_event completed.");

// Write the message to a file so the test runner can read it
const { mkdirSync } = await import("fs");
mkdirSync(join(import.meta.dirname!, "build"), { recursive: true });
writeFileSync(MESSAGE_FILE, MESSAGE);
console.log(`Unique test message written to ${MESSAGE_FILE}: ${MESSAGE}`);
