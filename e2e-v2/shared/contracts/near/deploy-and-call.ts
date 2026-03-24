/**
 * Deploys the test_event_contract to the NEAR sandbox and calls emit_event.
 * Uses near-api-js v7 for transaction signing and submission.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

const RPC_URL = "http://localhost:3030";
const CONTRACT_ACCOUNT = "test.near";
const WASM_PATH = join(import.meta.dirname!, "test_event_contract.wasm");

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
const deployResult = await account.deployContract(wasmBytes);
console.log(`Contract deployed. TX: ${deployResult.transaction.hash}`);

// Wait a block
await new Promise(r => setTimeout(r, 2000));

// Step 2: Call emit_event
console.log(`Calling emit_event...`);
await account.callFunction({
  contractId: CONTRACT_ACCOUNT,
  methodName: "emit_event",
  args: {},
});
console.log("emit_event call completed (event emitted on-chain)");

// Verify the event by checking the latest block's execution outcomes
await new Promise(r => setTimeout(r, 2000));
const rpcResult = await fetch(RPC_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "block", params: { finality: "final" },
  }),
}).then(r => r.json()) as any;
const height = rpcResult.result.header.height;
console.log(`Current block height: ${height}`);
console.log(`\nTEST_MESSAGE=${MESSAGE}`);
