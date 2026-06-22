// RING ZSwap e2e against a RUNNING dev stack (`bun run dev`) — settled through
// the BATCHER, so NO swap participant needs dust (only the batcher does).
//
//   N independent maker wallets, each holding a distinct shielded token Ti
//   (minted by genesis and transferred in). Each maker posts an UNBALANCED
//   offer  give Ti / want T(i+1)  (payFees:false → no dust). The offers form a
//   cycle  P0→P1→…→P(N-1)→P0.  A SOLVER (this script) merges the N proven
//   offers into ONE token-balanced transaction and hands it to the batcher's
//   midnight-balancer target, which adds dust + proves + submits → atomic
//   settlement. Every maker ends holding the token it wanted; every offer is
//   consumed and archived.
//
//   N=2 is the simplest "ring" (a straight A↔B swap); N=3 is a→b→c→a.
//
//   bun packages/tests/ring-swap-e2e.ts [N]   # default N=2

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { encodeOffer } from "mip-zswap-offer";
import type { FinalizedTransaction } from "@midnight-ntwrk/ledger-v8";
import pg from "pg";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";

import { joinOfferFiles, mintShielded } from "./lib/offer-files.ts";
import {
  buildWallet,
  shieldedBalances,
  shieldedKeys,
  transferShielded,
  waitForShielded,
  waitForSync,
} from "./lib/wallet.ts";
import { describeImbalances, mergeFinalized, settleViaBatcher } from "./lib/batcher.ts";

globalThis.WebSocket = WebSocket;
setNetworkId(net.id as any);

const N = Math.max(2, Number(process.argv[2] ?? "2") | 0);
const TAG = `[ring-${N}]`;
const API = "http://127.0.0.1:9999";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SEP_BASE = 0x70; // token domain separators 0x70..; distinct from prior tests
const MINT_AMOUNT = 1_000_000_000n;
const TRANSFER_AMOUNT = 5_000_000n; // genesis → each maker
const SWAP_AMOUNT = 1_000n; // each maker gives/wants this much
// Fresh maker seeds — distinct from genesis (…0001) and batcher (…0003/0004).
const makerSeed = (i: number) => `0000000000000000000000000000000000000000000000000000000000000${(i + 5).toString().padStart(3, "0")}`;

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

const before = {
  spent_nullifiers: await count("spent_nullifiers"),
  offers: await count("offer_file"),
};
console.log(`${TAG} before:`, JSON.stringify(before));

// ── 1. Genesis (minter / token source — the only wallet that needs dust, for
//        minting + the setup transfers; it is NOT a swap participant). ──
console.log(`${TAG} building genesis (minter) + ${N} maker wallets…`);
const genesis = await buildWallet(net.walletSeed);
const makers = await Promise.all(Array.from({ length: N }, (_, i) => buildWallet(makerSeed(i))));
try {
  await waitForSync(genesis, { requireUnshieldedFunds: true });
  try {
    await registerNightForDust(genesis as any);
  } catch (e) {
    console.warn(`${TAG} registerNightForDust: ${e instanceof Error ? e.message : String(e)} (continuing)`);
  }

  const makerAddrs = await Promise.all(makers.map((m) => m.wallet.shielded.getAddress()));

  // ── 2. Mint N distinct shielded tokens to genesis ──
  console.log(`${TAG} minting ${N} shielded tokens…`);
  const deployed = await joinOfferFiles(genesis);
  const nonce = BigInt(Date.now());
  const tokens: string[] = [];
  for (let i = 0; i < N; i++) {
    tokens.push(await mintShielded(deployed, SEP_BASE + i, MINT_AMOUNT, nonce + BigInt(i)));
  }
  console.log(`${TAG} tokens: ${tokens.map((t, i) => `T${i}=${t.slice(0, 10)}…`).join(" ")}`);
  check(`${N} shielded tokens minted`, tokens.every(Boolean));

  // ── 3. Transfer Ti → maker i ──
  for (let i = 0; i < N; i++) {
    const have = await waitForShielded(genesis, tokens[i], TRANSFER_AMOUNT, 24);
    if (have < TRANSFER_AMOUNT) throw new Error(`genesis missing T${i} (have ${have})`);
    console.log(`${TAG} transferring T${i} → maker ${i}…`);
    await transferShielded(genesis, tokens[i], TRANSFER_AMOUNT, makerAddrs[i]);
  }
  const fundedOk = (
    await Promise.all(makers.map((m, i) => waitForShielded(m, tokens[i], SWAP_AMOUNT, 36)))
  ).every((b, i) => b >= SWAP_AMOUNT);
  check(`all ${N} makers funded with their token`, fundedOk);

  // ── 4. Each maker builds the unbalanced cyclic offer: give Ti, want T(i+1) ──
  console.log(`${TAG} building ${N} cyclic offers (give Ti / want T(i+1))…`);
  const finalizedOffers: FinalizedTransaction[] = [];
  for (let i = 0; i < N; i++) {
    const wantColor = tokens[(i + 1) % N];
    const recipe = await makers[i].wallet.initSwap(
      { shielded: { [tokens[i]]: SWAP_AMOUNT } },
      [{ type: "shielded", outputs: [{ type: wantColor, amount: SWAP_AMOUNT, receiverAddress: makerAddrs[i] }] } as any],
      shieldedKeys(makers[i]),
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    finalizedOffers.push(await makers[i].wallet.finalizeTransaction(recipe.transaction));
  }

  // ── 5. Submit each offer → Celestia → indexed ──
  const offerIds: number[] = [];
  for (let i = 0; i < N; i++) {
    const blob = encodeOffer(finalizedOffers[i].serialize());
    let sub = await submitOffer(blob);
    for (let r = 0; r < 24 && sub.status === 400 && sub.body?.error === "ROOT_UNKNOWN"; r++) {
      await sleep(5000);
      sub = await submitOffer(blob);
    }
    check(`offer ${i} accepted by submit gate`, sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.body?.error ?? "")}`);
  }
  const indexedOk = await waitFor("offers indexed", async () => (await count("offer_file")) >= before.offers + N, 24);
  const rows = await db<{ id: number }>(`SELECT id FROM offer_file ORDER BY id DESC LIMIT ${N}`);
  rows.forEach((r) => offerIds.push(r.id));
  check(`${N} offers indexed via Celestia → STM`, indexedOk, `ids=${offerIds.join(",")}`);

  // ── 6. SOLVER: merge offers into one token-balanced tx; settle via batcher ──
  console.log(`${TAG} merging ${N} offers into one atomic tx…`);
  const merged = mergeFinalized(finalizedOffers);
  console.log(`${TAG} merged tx imbalances (token side should be empty): ${describeImbalances(merged)}`);
  console.log(`${TAG} handing merged tx to batcher (it adds dust + settles)…`);
  const settle = await settleViaBatcher(merged);
  check("batcher accepted + settled merged ring tx (batcher pays dust)", settle.ok, `status=${settle.status} ${JSON.stringify(settle.body)?.slice(0, 160)}`);

  // ── 7. Settlement effects ──
  const spentOk = await waitFor(`spent_nullifiers += ${N}`, async () => (await count("spent_nullifiers")) >= before.spent_nullifiers + N, 36);
  check(`spent_nullifiers grew by ${N} (all offer inputs consumed)`, spentOk, `before=${before.spent_nullifiers} now=${await count("spent_nullifiers")}`);

  const archivedOk = await waitFor("all offers archived", async () => {
    const active = await db<{ id: number }>(`SELECT id FROM offer_file WHERE id IN (${offerIds.join(",")})`);
    return active.length === 0;
  }, 24);
  check(`all ${N} offers ARCHIVED after settlement`, archivedOk);

  // ── 8. Each maker received the token it wanted ──
  const received = await Promise.all(makers.map((m, i) => waitForShielded(m, tokens[(i + 1) % N], SWAP_AMOUNT, 24)));
  received.forEach((bal, i) => check(`maker ${i} received T${(i + 1) % N} (wanted token)`, bal >= SWAP_AMOUNT, `bal=${bal}`));

  // Sanity: log each maker's full shielded balances
  for (let i = 0; i < N; i++) {
    const b = await shieldedBalances(makers[i]);
    console.log(`${TAG} maker ${i} balances: ${JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k.slice(0, 8), String(v)])))}`);
  }
} finally {
  await Promise.all(makers.map((m) => m.wallet.stop().catch(() => {})));
  await genesis.wallet.stop().catch(() => {});
}

console.log(failures === 0 ? `\n${TAG} ✅ RING SWAP PASS (batcher-settled, no participant dust)` : `\n${TAG} ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
