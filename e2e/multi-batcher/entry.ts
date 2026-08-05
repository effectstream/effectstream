// Container entrypoint for the e2e guard's `app` service:
// deploy the counter contract, then run the 3-product shared batcher.
//
// Funding and the assertions themselves run on the HOST (run-tests.ts) — this
// container only owns the two things that must live next to the chain.

import { existsSync } from "node:fs";
import path from "node:path";

const E2E_ROOT = path.join(import.meta.dirname!, "..");
const CONTRACTS_DIR = path.join(E2E_ROOT, "shared/contracts/midnight");
const ADDRESS_FILE = path.join(CONTRACTS_DIR, "contract-counter.undeployed.json");

if (existsSync(ADDRESS_FILE)) {
  console.log("[entry] deploy: skipped (address file exists)");
} else {
  console.log("[entry] ── deploying counter contract...");
  const deploy = Bun.spawn(["bun", "run", "contract-counter-deploy.ts"], {
    cwd: CONTRACTS_DIR,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env as Record<string, string>,
  });
  const code = await deploy.exited;
  if (code !== 0) {
    console.error(`[entry] contract deploy failed with exit code ${code}`);
    process.exit(code);
  }
  console.log("[entry] ── deploy: done");
}

// The host funds the product wallets after the deploy; the batcher's adapters
// need spendable dust at init, so wait for the host's readiness marker.
const MARKER = path.join(E2E_ROOT, "multi-batcher/batcher-data/funding-ready.json");
const deadline = Date.now() + 20 * 60 * 1000;
if (!existsSync(MARKER)) {
  console.log("[entry] ── waiting for host funding to complete...");
  while (!existsSync(MARKER)) {
    if (Date.now() > deadline) {
      console.error("[entry] timed out waiting for funding marker");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
}
console.log("[entry] ── funding ready");

console.log("[entry] ── starting shared batcher...");
const batcher = Bun.spawn(["bun", "run", "batcher/main.ts"], {
  cwd: path.join(E2E_ROOT, "multi-batcher"),
  stdout: "inherit",
  stderr: "inherit",
  env: process.env as Record<string, string>,
});
process.exit(await batcher.exited);
