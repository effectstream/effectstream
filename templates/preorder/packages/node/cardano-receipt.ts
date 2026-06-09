import fs from "node:fs";
import path from "node:path";

// Single source of the receipt minting-policy id for the sync node. Written by the
// `cardano-validator` orchestrator step (contracts-cardano/build-validator.ts) before sync
// starts. The config predicate and the STM both read this so all three agree byte-for-byte.
let policyId = "";
try {
  policyId = fs
    .readFileSync(
      path.resolve(import.meta.dirname!, "../contracts-cardano/temp/receipt-policy-id.txt"),
      "utf-8",
    )
    .trim();
} catch {
  console.warn("[cardano-receipt] receipt-policy-id.txt not found yet — predicate will match nothing");
}

export const RECEIPT_POLICY_ID = policyId;

// The applied PlutusV3 receipt script (CBOR hex), exposed to the frontend via /api/config so
// the browser can build the receipt-minting purchase tx (same script => same policy id).
let appliedScript = "";
try {
  appliedScript = fs
    .readFileSync(
      path.resolve(import.meta.dirname!, "../contracts-cardano/temp/receipt-applied-script.txt"),
      "utf-8",
    )
    .trim();
} catch {
  console.warn("[cardano-receipt] receipt-applied-script.txt not found yet");
}

export const RECEIPT_SCRIPT = appliedScript;
