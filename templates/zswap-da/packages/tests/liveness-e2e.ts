// End-to-end check of the liveness gates against a RUNNING dev stack
// (orchestrator up, node synced). Proves: (1) garbage is rejected at submit;
// (2) a fresh real offer whose input root the node has synced into known_roots
// is ACCEPTED (the always-on root check must not brick legitimate offers);
// (3) the new liveness tables are populated by the sync primitives.
//
//   bun packages/tests/liveness-e2e.ts

import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import { encodeOffer } from "mip-zswap-offer";
import pg from "pg";

const API = "http://127.0.0.1:9999";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function submit(blob: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${API}/api/zswap/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blob }),
  });
  let body: any;
  try { body = await r.json(); } catch { body = await r.text(); }
  return { status: r.status, body };
}

async function tableCounts() {
  const c = new pg.Client({ host: "127.0.0.1", port: 5432, user: "postgres", database: "postgres" });
  await c.connect();
  try {
    const q = async (t: string) => (await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
    return {
      known_roots: await q("known_roots"),
      created_unshielded: await q("created_unshielded"),
      spent_nullifiers: await q("spent_nullifiers"),
    };
  } finally { await c.end().catch(() => {}); }
}

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

// 1) tables populated by the new sync primitives
const counts = await tableCounts();
console.log("[e2e] liveness tables:", JSON.stringify(counts));
check("known_roots populated by midnight-zswap-root primitive", counts.known_roots > 0);
// created_unshielded only fills when the chain has unshielded ACTIVITY — a
// fresh devnet has none (genesis allocations are not transactions). Assert it
// when activity exists; otherwise note the skip. full-lifecycle-e2e.ts covers
// the rest of the lifecycle.
if (counts.created_unshielded > 0) {
  check("created_unshielded populated by midnight-unshielded-create primitive", true);
} else {
  console.log("⏭  created_unshielded = 0 (no unshielded txs on this chain yet — skipping)");
}

// 2) garbage → 400 BAD_ENCODING (submit gate runs)
const garbage = await submit("not-a-zswap-offer");
check("garbage offer rejected 400", garbage.status === 400, `status=${garbage.status} error=${garbage.body?.error}`);

// 3) a fresh real offer, accepted once its root is synced into known_roots
const result = await buildWalletAndWaitForFunds(
  { id: net.id, indexer: net.indexer, indexerWS: net.indexerWS, node: net.node, proofServer: net.proofServer } as any,
  net.walletSeed, net.id as any,
);
let blob: string;
try {
  const st = await result.wallet.shielded.waitForSyncedState();
  const give = Object.entries(st.balances as Record<string, bigint>).sort((a, b) => a[1] < b[1] ? 1 : -1)[0][0];
  const addr = await result.wallet.shielded.getAddress();
  const recipe = await result.wallet.initSwap(
    { shielded: { [give]: 1_000_000n } },
    [{ type: "shielded", outputs: [{ type: "ff".repeat(32), amount: 5_000_000n, receiverAddress: addr }] } as any],
    { shieldedSecretKeys: result.zswapSecretKeys, dustSecretKey: result.dustSecretKey },
    { ttl: new Date(Date.now() + 1800_000), payFees: false },
  );
  blob = encodeOffer((await result.wallet.finalizeTransaction(recipe.transaction)).serialize());
} finally { await result.wallet.stop().catch(() => {}); }

// The node must ingest the root the offer proved against; retry while it syncs.
let res = await submit(blob);
for (let i = 0; i < 24 && res.status === 400 && res.body?.error === "ROOT_UNKNOWN"; i++) {
  await sleep(5000);
  res = await submit(blob);
}
check("fresh valid offer accepted by submit gate", res.status === 200, `status=${res.status} body=${JSON.stringify(res.body).slice(0, 120)}`);

console.log(failures === 0 ? "\n[e2e] ✅ ALL PASS" : `\n[e2e] ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
