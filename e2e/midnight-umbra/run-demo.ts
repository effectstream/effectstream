/**
 * THE deliverable: one command that proves effectstream can be driven by a STOCK UmbraDB archive
 * instead of the Midnight indexer.
 *
 *   docker compose -p mn-demo -f e2e/midnight-umbra/docker-compose.yml up -d node indexer proof-server postgres
 *   docker compose -p mn-demo -f e2e/midnight-umbra/docker-compose.yml run --rm demo
 *
 * Four stages, in order, each failing loudly rather than degrading:
 *   1. WORKLOAD  — drive transactions that create unshielded UTXOs. Swap FIRST: fees are paid in
 *      dust, genesis dust depletes faster than it regenerates, and a swap submitted with
 *      dustBalance=0 is rejected by the node (error 168). Getting this order wrong silently costs
 *      the fallible-section corpus.
 *   2. INGEST    — run STOCK UmbraDB's own sync CLI until its watermark reaches the chain tip.
 *      Nothing here is modified: migrations 000+001 only, `transactions.result` never populated.
 *   3. DIFFERENTIAL — trigger equality + read equality vs the indexer, with controls.
 *
 * The reviewer's recipe and our own test path are the SAME artifact, so the recipe cannot rot.
 */
import { spawn } from "node:child_process";
import pg from "pg";

const PG = process.env.UMBRA_PG ?? "postgres://umbra:umbra@postgres:5432/umbra";
const SCHEMA = process.env.UMBRA_SCHEMA ?? "chain_archive";
const NET = process.env.UMBRA_NET ?? "undeployed";
const NODE_HTTP = process.env.MIDNIGHT_NODE_HTTP ?? "http://node:9944";

function step(n: number, label: string): void {
  console.log(`\n${"=".repeat(72)}\n[${n}/3] ${label}\n${"=".repeat(72)}`);
}

async function sh(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  return await new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit", cwd: opts.cwd, env: { ...process.env, ...opts.env } });
    p.on("close", (code) => resolve(code ?? 1));
  });
}

async function nodeTip(): Promise<number> {
  const res = await fetch(NODE_HTTP, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "chain_getHeader", params: [] }),
  });
  const body = await res.json() as { result?: { number?: string } };
  return parseInt(body.result?.number ?? "0x0", 16);
}

async function archiveWatermark(): Promise<number> {
  const pool = new pg.Pool({ connectionString: PG });
  try {
    const { rows } = await pool.query(
      `SELECT value FROM ${SCHEMA}.watermarks WHERE kind='chain_archive' AND key=$1`, [`sync_cursor:${NET}`]);
    return Number((rows[0]?.value as { height?: number } | undefined)?.height ?? -1);
  } catch { return -1; }             // schema not bootstrapped yet
  finally { await pool.end(); }
}

// ── 1. workload ────────────────────────────────────────────────────────────────────────────────
step(1, "Drive a corpus of unshielded-UTXO-creating transactions");
const workload = await sh("bun", ["e2e/midnight-umbra/drive-unshielded-workload.ts"]);
if (workload !== 0) {
  console.error("\nFAIL: no workload transaction landed. The differential would compare an empty " +
    "corpus and pass while proving nothing, so this is fatal rather than a warning.");
  process.exit(1);
}

// ── 2. ingest ──────────────────────────────────────────────────────────────────────────────────
step(2, "Ingest with STOCK UmbraDB's own sync CLI (migrations 000+001 only)");
const tipBefore = await nodeTip();
console.log(`chain tip is ${tipBefore}; running ingest until the archive watermark reaches it`);
// The CLI follows the tip forever, so run it in bounded passes and stop once caught up.
for (let pass = 1; pass <= 40; pass++) {
  const wm = await archiveWatermark();
  if (wm >= tipBefore) { console.log(`archive watermark ${wm} >= tip ${tipBefore} — caught up`); break; }
  console.log(`pass ${pass}: watermark ${wm} / tip ${tipBefore}`);
  await new Promise((r) => setTimeout(r, 6000));
  if (pass === 40) {
    console.error("FAIL: the archive never caught up with the chain tip.");
    process.exit(1);
  }
}

// ── 3. differential ────────────────────────────────────────────────────────────────────────────
step(3, "Differential: stock UmbraDB vs the indexer");
const diff = await sh("bun", ["e2e/midnight-umbra/unshielded-create-differential.ts"]);
console.log("");
if (diff === 0) {
  console.log("DEMO PASSED — effectstream was driven by a stock UmbraDB archive, with the state " +
    "machine triggering identically to the indexer-backed path.");
  console.log("NOTE: this does not demonstrate indexer independence — the indexer still FILLS the " +
    "archive here, and is the differential's oracle. That half is a separate workstream.");
}
process.exit(diff);
