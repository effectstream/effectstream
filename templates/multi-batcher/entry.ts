// Container entrypoint: deploy product-a's contract → fund all wallets →
// run THE shared batcher.
//
// Each stage is idempotent and skippable, so `docker compose restart app`
// after a batcher code change goes straight to the batcher.

import { existsSync } from "node:fs";
import path from "node:path";

const root = import.meta.dirname!;
const NETWORK_ID = process.env.MIDNIGHT_NETWORK_ID ?? "undeployed";

const CONTRACT_ADDRESS_FILE = path.join(
  root,
  `product-a/contract-counter.${NETWORK_ID}.json`,
);
const FUNDING_READY_FILE = path.join(root, "batcher-data/funding-ready.json");

async function run(label: string, cmd: string[]): Promise<void> {
  console.log(`\n[entry] ── ${label}: ${cmd.join(" ")}`);
  const proc = Bun.spawn(cmd, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env as Record<string, string>,
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`[entry] ${label} failed with exit code ${code}`);
  console.log(`[entry] ── ${label}: done`);
}

if (process.env.SKIP_DEPLOY || existsSync(CONTRACT_ADDRESS_FILE)) {
  console.log(
    `[entry] deploy: skipped (${
      existsSync(CONTRACT_ADDRESS_FILE) ? "address file exists" : "SKIP_DEPLOY"
    })`,
  );
} else {
  await run("deploy product-a counter contract", ["bun", "run", "deploy:product-a"]);
}

if (process.env.SKIP_FUND || existsSync(FUNDING_READY_FILE)) {
  console.log(
    `[entry] fund: skipped (${
      existsSync(FUNDING_READY_FILE) ? "funding marker exists" : "SKIP_FUND"
    })`,
  );
} else {
  await run("fund product + actor wallets", ["bun", "run", "fund"]);
}

console.log("\n[entry] ── starting shared batcher (long-running)...");
const batcher = Bun.spawn(["bun", "run", "batcher"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
  env: process.env as Record<string, string>,
});
process.exit(await batcher.exited);
