// MULTI-GIVE / MULTI-WANT ZSwap e2e — settled through the batcher (no
// participant dust). Exercises offers that move several token colors at once:
//
//   P0 holds {T0, T1}, offers  give {T0, T1} / want {T2}     (multi-give)
//   P1 holds {T2},     offers  give {T2}     / want {T0, T1}  (multi-want)
//
// Merged, every color nets out (T0,T1 flow P0→P1; T2 flows P1→P0), so only
// fees remain and the batcher settles the pair atomically.
//
//   bun packages/tests/multi-token-swap-e2e.ts

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { encodeOffer } from "mip-zswap-offer";
import type { FinalizedTransaction } from "@midnight-ntwrk/ledger-v8";
import pg from "pg";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";

import { joinOfferFiles, mintShielded } from "./lib/offer-files.ts";
import { buildWallet, shieldedBalances, shieldedKeys, transferShielded, waitForShielded, waitForSync } from "./lib/wallet.ts";
import { describeImbalances, mergeFinalized, settleViaBatcher } from "./lib/batcher.ts";

globalThis.WebSocket = WebSocket;
setNetworkId(net.id as any);

const TAG = "[multi-token]";
const API = "http://127.0.0.1:9999";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SEP = { T0: 0x80, T1: 0x81, T2: 0x82 } as const; // distinct from prior tests
const MINT_AMOUNT = 1_000_000_000n;
const FUND = 5_000_000n; // genesis → maker per color
const A0 = 1_000n; // P0 gives T0
const A1 = 1_000n; // P0 gives T1
const A2 = 2_000n; // P1 gives T2 (== A0 + A1)
const P0_SEED = "0000000000000000000000000000000000000000000000000000000000000010";
const P1_SEED = "0000000000000000000000000000000000000000000000000000000000000011";

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
  console.log(`  (waitFor ${name} timed out)`);
  return false;
}

async function submitOffer(blob: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${API}/api/zswap/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blob }),
  });
  let body: any;
  try {
    body = await r.json();
  } catch {
    body = await r.text();
  }
  return { status: r.status, body };
}

async function submitIndexed(finalized: FinalizedTransaction): Promise<void> {
  const blob = encodeOffer(finalized.serialize());
  let sub = await submitOffer(blob);
  for (let r = 0; r < 24 && sub.status === 400 && sub.body?.error === "ROOT_UNKNOWN"; r++) {
    await sleep(5000);
    sub = await submitOffer(blob);
  }
  check(`offer accepted by submit gate`, sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.body?.error ?? "")}`);
}

const before = {
  spent_nullifiers: await count("spent_nullifiers"),
  offers: await count("offer_file"),
};
console.log(`${TAG} before:`, JSON.stringify(before));

console.log(`${TAG} building genesis (minter) + P0 + P1…`);
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

  // Mint T0,T1,T2 to genesis
  console.log(`${TAG} minting T0,T1,T2…`);
  const deployed = await joinOfferFiles(genesis);
  const nonce = BigInt(Date.now());
  const T0 = await mintShielded(deployed, SEP.T0, MINT_AMOUNT, nonce + 0n);
  const T1 = await mintShielded(deployed, SEP.T1, MINT_AMOUNT, nonce + 1n);
  const T2 = await mintShielded(deployed, SEP.T2, MINT_AMOUNT, nonce + 2n);
  console.log(`${TAG} T0=${T0.slice(0, 10)}… T1=${T1.slice(0, 10)}… T2=${T2.slice(0, 10)}…`);
  check("T0,T1,T2 minted", !!T0 && !!T1 && !!T2);

  // Fund P0 with {T0,T1}; P1 with {T2}
  for (const [color, label] of [[T0, "T0"], [T1, "T1"], [T2, "T2"]] as const) {
    const have = await waitForShielded(genesis, color, FUND, 24);
    if (have < FUND) throw new Error(`genesis missing ${label} (have ${have})`);
  }
  console.log(`${TAG} funding P0 with {T0,T1}, P1 with {T2}…`);
  await transferShielded(genesis, T0, FUND, p0Addr);
  await transferShielded(genesis, T1, FUND, p0Addr);
  await transferShielded(genesis, T2, FUND, p1Addr);
  const p0Funded = (await waitForShielded(p0, T0, A0, 36)) >= A0 && (await waitForShielded(p0, T1, A1, 12)) >= A1;
  const p1Funded = (await waitForShielded(p1, T2, A2, 36)) >= A2;
  check("P0 funded with {T0,T1}", p0Funded);
  check("P1 funded with {T2}", p1Funded);

  // P0: multi-GIVE  give {T0:A0, T1:A1} / want {T2:A2}
  console.log(`${TAG} P0 building multi-give offer (give {T0,T1} / want T2)…`);
  const r0 = await p0.wallet.initSwap(
    { shielded: { [T0]: A0, [T1]: A1 } },
    [{ type: "shielded", outputs: [{ type: T2, amount: A2, receiverAddress: p0Addr }] } as any],
    shieldedKeys(p0),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const offer0 = await p0.wallet.finalizeTransaction(r0.transaction);

  // P1: multi-WANT  give {T2:A2} / want {T0:A0, T1:A1}
  console.log(`${TAG} P1 building multi-want offer (give T2 / want {T0,T1})…`);
  const r1 = await p1.wallet.initSwap(
    { shielded: { [T2]: A2 } },
    [{
      type: "shielded",
      outputs: [
        { type: T0, amount: A0, receiverAddress: p1Addr },
        { type: T1, amount: A1, receiverAddress: p1Addr },
      ],
    } as any],
    shieldedKeys(p1),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const offer1 = await p1.wallet.finalizeTransaction(r1.transaction);

  // Index both
  await submitIndexed(offer0);
  await submitIndexed(offer1);
  const indexedOk = await waitFor("offers indexed", async () => (await count("offer_file")) >= before.offers + 2, 24);
  const ids = (await db<{ id: number }>(`SELECT id FROM offer_file ORDER BY id DESC LIMIT 2`)).map((r) => r.id);
  check("2 multi-token offers indexed", indexedOk, `ids=${ids.join(",")}`);

  // Merge + settle via batcher
  console.log(`${TAG} merging multi-give + multi-want offers…`);
  const merged = mergeFinalized([offer0, offer1]);
  console.log(`${TAG} merged imbalances (token side should be empty): ${describeImbalances(merged)}`);
  const settle = await settleViaBatcher(merged);
  check("batcher settled merged multi-token tx (batcher pays dust)", settle.ok, `status=${settle.status} ${JSON.stringify(settle.body)?.slice(0, 160)}`);

  const spentOk = await waitFor("spent_nullifiers += 2", async () => (await count("spent_nullifiers")) >= before.spent_nullifiers + 2, 36);
  check("spent_nullifiers grew by 2", spentOk, `before=${before.spent_nullifiers} now=${await count("spent_nullifiers")}`);

  const archivedOk = await waitFor("offers archived", async () => (await db(`SELECT id FROM offer_file WHERE id IN (${ids.join(",")})`)).length === 0, 24);
  check("both offers ARCHIVED", archivedOk);

  // P0 should now hold T2 (>=A2); P1 should hold T0 (>=A0) and T1 (>=A1)
  const p0gotT2 = await waitForShielded(p0, T2, A2, 24);
  const p1gotT0 = await waitForShielded(p1, T0, A0, 24);
  const p1gotT1 = await waitForShielded(p1, T1, A1, 12);
  check("P0 received T2 (multi-give settled)", p0gotT2 >= A2, `T2=${p0gotT2}`);
  check("P1 received T0 + T1 (multi-want settled)", p1gotT0 >= A0 && p1gotT1 >= A1, `T0=${p1gotT0} T1=${p1gotT1}`);

  console.log(`${TAG} P0 balances: ${JSON.stringify(Object.fromEntries(Object.entries(await shieldedBalances(p0)).map(([k, v]) => [k.slice(0, 8), String(v)])))}`);
  console.log(`${TAG} P1 balances: ${JSON.stringify(Object.fromEntries(Object.entries(await shieldedBalances(p1)).map(([k, v]) => [k.slice(0, 8), String(v)])))}`);
} finally {
  await p0.wallet.stop().catch(() => {});
  await p1.wallet.stop().catch(() => {});
  await genesis.wallet.stop().catch(() => {});
}

console.log(failures === 0 ? `\n${TAG} ✅ MULTI-TOKEN SWAP PASS` : `\n${TAG} ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
