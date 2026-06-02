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
