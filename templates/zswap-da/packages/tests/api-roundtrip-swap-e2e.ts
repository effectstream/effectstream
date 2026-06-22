// API ROUND-TRIP swap e2e — the faithful end-to-end path:
//
//   makers PUSH offers via /api/zswap/submit → batcher → Celestia → indexed
//   SOLVER READS the offers back from GET /api/zswaps and reconstructs each
//   tx from the served blob (transaction_hex), then merges + settles via the
//   batcher. This validates the Celestia fetch + validate + index + serve
//   primitives, not an in-memory shortcut.
//
//   Plus the negative path: an INVALID zswap must be rejected at submit and
//   NEVER reach Celestia (offer_file count unchanged).
//
//   bun packages/tests/api-roundtrip-swap-e2e.ts

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { encodeOffer } from "mip-zswap-offer";
import pg from "pg";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";

import { joinOfferFiles, mintShielded } from "./lib/offer-files.ts";
import { buildWallet, shieldedKeys, transferShielded, waitForShielded, waitForSync } from "./lib/wallet.ts";
import { describeImbalances, mergeFinalized, nonDustImbalances, settleViaBatcher } from "./lib/batcher.ts";
import { getZswaps, reconstructOffer, submitOffer } from "./lib/api.ts";

globalThis.WebSocket = WebSocket;
setNetworkId(net.id as any);

const TAG = "[api-roundtrip]";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEP = { T0: 0xa0, T1: 0xa1 } as const;
const MINT_AMOUNT = 1_000_000_000n;
const FUND = 5_000_000n;
const AMT = 1_000n;
const P0_SEED = "0000000000000000000000000000000000000000000000000000000000000030";
const P1_SEED = "0000000000000000000000000000000000000000000000000000000000000031";

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

async function db<T = any>(q: string): Promise<T[]> {
  const c = new pg.Client({ host: "127.0.0.1", port: 5432, user: "postgres", database: "postgres" });
  await c.connect();
  try {
    return (await c.query(q)).rows;
  } finally {
    await c.end().catch(() => {});
  }
}
const count = async (t: string) => Number((await db(`SELECT count(*)::int n FROM ${t}`))[0].n);
async function waitFor(name: string, fn: () => Promise<boolean>, tries = 36, ms = 5000): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await sleep(ms);
  }
  return false;
}

async function submitIndexed(blob: string, label: string): Promise<void> {
  let sub = await submitOffer(blob);
  for (let r = 0; r < 24 && sub.status === 400 && sub.body?.error === "ROOT_UNKNOWN"; r++) {
    await sleep(5000);
    sub = await submitOffer(blob);
  }
  check(`${label} accepted by submit gate`, sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.body?.error ?? "")}`);
}

console.log(`${TAG} building genesis + P0 + P1…`);
const genesis = await buildWallet(net.walletSeed);
const p0 = await buildWallet(P0_SEED);
const p1 = await buildWallet(P1_SEED);
try {
  await waitForSync(genesis, { requireUnshieldedFunds: true });
  try {
    await registerNightForDust(genesis as any);
  } catch (e) {
    console.warn(`${TAG} registerNightForDust: ${e instanceof Error ? e.message : String(e)} (continuing)`);
  }
  const p0Addr = await p0.wallet.shielded.getAddress();
  const p1Addr = await p1.wallet.shielded.getAddress();

  // Mint T0,T1; fund P0 with T0, P1 with T1
  console.log(`${TAG} minting T0,T1 + funding makers…`);
  const deployed = await joinOfferFiles(genesis);
  const nonce = BigInt(Date.now());
  const T0 = await mintShielded(deployed, SEP.T0, MINT_AMOUNT, nonce);
  const T1 = await mintShielded(deployed, SEP.T1, MINT_AMOUNT, nonce + 1n);
  for (const [c, l] of [[T0, "T0"], [T1, "T1"]] as const) {
    if ((await waitForShielded(genesis, c, FUND, 24)) < FUND) throw new Error(`genesis missing ${l}`);
  }
  await transferShielded(genesis, T0, FUND, p0Addr);
  await transferShielded(genesis, T1, FUND, p1Addr);
  check("makers funded", (await waitForShielded(p0, T0, AMT, 36)) >= AMT && (await waitForShielded(p1, T1, AMT, 36)) >= AMT);

  // Build offers: P0 give T0 want T1; P1 give T1 want T0
  const r0 = await p0.wallet.initSwap(
    { shielded: { [T0]: AMT } },
    [{ type: "shielded", outputs: [{ type: T1, amount: AMT, receiverAddress: p0Addr }] } as any],
    shieldedKeys(p0),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const blob0 = encodeOffer((await p0.wallet.finalizeTransaction(r0.transaction)).serialize());
  const r1 = await p1.wallet.initSwap(
    { shielded: { [T1]: AMT } },
    [{ type: "shielded", outputs: [{ type: T0, amount: AMT, receiverAddress: p1Addr }] } as any],
    shieldedKeys(p1),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const blob1 = encodeOffer((await p1.wallet.finalizeTransaction(r1.transaction)).serialize());

  // ── PUSH both offers via the API → Celestia → indexed ──
  const offersBefore = await count("offer_file");
  console.log(`${TAG} pushing 2 offers via /api/zswap/submit…`);
  await submitIndexed(blob0, "P0 offer (give T0 / want T1)");
  await submitIndexed(blob1, "P1 offer (give T1 / want T0)");
  const indexedOk = await waitFor("offers indexed", async () => (await count("offer_file")) >= offersBefore + 2, 24);
  check("2 offers indexed (reached Celestia + STM)", indexedOk);

  // ── READ the offers back from the API and reconstruct them ──
  console.log(`${TAG} reading available zswaps back from GET /api/zswaps…`);
  const myColors = new Set([T0, T1]);
  const apiOffers = (await getZswaps({ limit: 100 })).filter((o) =>
    o.gives.some((g) => myColors.has(g.token)) || o.wants.some((w) => myColors.has(w.token))
  );
  check("API returned my 2 offers", apiOffers.length === 2, `got ${apiOffers.length}`);

  // Sanity: the API's derived gives/wants reflect the real swap directions.
  const giveColors = new Set(apiOffers.flatMap((o) => o.gives.map((g) => g.token)));
  const wantColors = new Set(apiOffers.flatMap((o) => o.wants.map((w) => w.token)));
  check("API gives/wants reflect T0↔T1 swap", giveColors.has(T0) && giveColors.has(T1) && wantColors.has(T0) && wantColors.has(T1),
    `gives=${[...giveColors].map((c) => c.slice(0, 6))} wants=${[...wantColors].map((c) => c.slice(0, 6))}`);

  // Reconstruct each offer tx FROM the API blob (the Celestia round-trip data)
  console.log(`${TAG} reconstructing offers from API transaction_hex…`);
  let reconstructed;
  try {
    reconstructed = apiOffers.map((o) => reconstructOffer(o.transaction_hex));
    check("reconstructed both offers from API blob", reconstructed.length === 2);
  } catch (e) {
    check("reconstructed both offers from API blob", false, String(e).slice(0, 140));
    throw e;
  }

  // ── Merge the RECONSTRUCTED offers + settle via batcher ──
  const merged = mergeFinalized(reconstructed);
  console.log(`${TAG} merged (from API data) imbalances: ${describeImbalances(merged)}`);
  check("merged tx from API data is token-balanced", nonDustImbalances(merged).length === 0);
  const spentBefore = await count("spent_nullifiers");
  const settle = await settleViaBatcher(merged);
  check("batcher settled tx reconstructed from API/Celestia data", settle.ok, `status=${settle.status}`);

  const spentOk = await waitFor("spent_nullifiers += 2", async () => (await count("spent_nullifiers")) >= spentBefore + 2, 36);
  check("spent_nullifiers grew by 2 (both offers consumed)", spentOk, `before=${spentBefore} now=${await count("spent_nullifiers")}`);
  const archivedOk = await waitFor("offers archived", async () => {
    const ids = apiOffers.map((o) => o.id).join(",");
    return (await db(`SELECT id FROM offer_file WHERE id IN (${ids})`)).length === 0;
  }, 36);
  check("both offers archived after settlement", archivedOk);
  check("P0 received T1", (await waitForShielded(p0, T1, AMT, 24)) >= AMT);
  check("P1 received T0", (await waitForShielded(p1, T0, AMT, 24)) >= AMT);

  // ── NEGATIVE 1: a corrupted/invalid blob must be rejected and NOT reach Celestia ──
  console.log(`${TAG} NEGATIVE: submitting a corrupted offer blob…`);
  const beforeBad1 = await count("offer_file");
  const corrupted = blob0.slice(0, blob0.length - 12) + "deadbeef0000"; // mangle the tail
  const badRes1 = await submitOffer(corrupted);
  check("corrupted offer rejected at submit (400)", badRes1.status === 400, `status=${badRes1.status} error=${badRes1.body?.error}`);
  await sleep(8000); // give any erroneous Celestia post time to index (it must not)
  check("corrupted offer NEVER reached Celestia (not indexed)", (await count("offer_file")) === beforeBad1, `before=${beforeBad1} now=${await count("offer_file")}`);

  // ── NEGATIVE 2: re-submitting a now-CONSUMED offer must be rejected (NULLIFIER_SPENT) ──
  console.log(`${TAG} NEGATIVE: re-submitting the already-settled P0 offer…`);
  const beforeBad2 = await count("offer_file");
  const badRes2 = await submitOffer(blob0);
  check("spent-offer re-submit rejected (NULLIFIER_SPENT)", badRes2.status === 400 && badRes2.body?.error === "NULLIFIER_SPENT", `status=${badRes2.status} error=${badRes2.body?.error}`);
  await sleep(8000);
  check("spent-offer re-submit NEVER reached Celestia (not indexed)", (await count("offer_file")) === beforeBad2, `before=${beforeBad2} now=${await count("offer_file")}`);
} finally {
  await p0.wallet.stop().catch(() => {});
  await p1.wallet.stop().catch(() => {});
  await genesis.wallet.stop().catch(() => {});
}

console.log(failures === 0 ? `\n${TAG} ✅ API ROUND-TRIP + NEGATIVE PASS` : `\n${TAG} ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
