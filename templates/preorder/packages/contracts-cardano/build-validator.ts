import fs from "node:fs";
import path from "node:path";
import {
  applyParamsToScript,
  applyDoubleCborEncoding,
  mintingPolicyToId,
  paymentCredentialOf,
} from "@lucid-evolution/utils";
import { CARDANO_PAYMENT_ADDRESS } from "./constants.ts";

const __dirname = import.meta.dirname!;

// Dev: open sale window. Production: set real POSIX-ms bounds.
const SALE_START = 0n;
const SALE_END = 99_999_999_999_999n;
// Referrer reward in basis points — matches the EVM launchpad's REFERRER_REWARD_BPS (5%).
const REFERRER_REWARD_BPS = 500n;

const plutus = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "plutus.json"), "utf-8"),
);
const v = plutus.validators.find((x: any) =>
  String(x.title).startsWith("launchpad_receipt")
);
if (!v) throw new Error("launchpad_receipt validator not found in plutus.json");

const paymentHash = paymentCredentialOf(CARDANO_PAYMENT_ADDRESS).hash;

// Param order MUST match the validator signature:
// (payment_credential_hash, referrer_reward_bps, sale_start, sale_end)
const appliedScript = applyParamsToScript(
  applyDoubleCborEncoding(v.compiledCode),
  [paymentHash, REFERRER_REWARD_BPS, SALE_START, SALE_END],
);

const policy = { type: "PlutusV3" as const, script: appliedScript };
const policyId = mintingPolicyToId(policy);

const outDir = path.resolve(__dirname, "temp");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "receipt-policy-id.txt"), policyId);
fs.writeFileSync(path.join(outDir, "receipt-applied-script.txt"), appliedScript);
fs.writeFileSync(
  path.join(outDir, "receipt-params.json"),
  JSON.stringify(
    {
      paymentHash,
      referrerRewardBps: String(REFERRER_REWARD_BPS),
      saleStart: String(SALE_START),
      saleEnd: String(SALE_END),
    },
    null,
    2,
  ),
);
console.log("[build-validator] PlutusV3 receipt policy id:", policyId);
