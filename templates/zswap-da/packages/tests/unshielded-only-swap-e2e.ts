// UNSHIELDED-ONLY swap e2e — the swap shape the SDK actually supports
// (`facade/test/swap.test.ts` has a full unshielded-swap test; the COMBINED
// shielded↔unshielded one is `it.skip(… "Not supported yet"`). Settled through
// the batcher, so neither party needs dust.
//
//   M0 holds U0, offers  give U0 / want U1   (its own unshielded swap-intent,
//                                             signed with M0's unshielded key)
//   M1 holds U1, is the TAKER: balances M0's offer with tokenKindsToBalance
//   ['unshielded'] (provides U1, takes U0 — NO dust), signs its unshielded
//   input, finalizes → one token-balanced tx → batcher adds dust + submits.
//
// We can't merge two maker offers like the shielded rings: Lace/SDK land every
// unshielded swap-intent at segment 1, so two of them collide on merge. The
// taker-balances-the-offer flow (what the frontend uses for unshielded) avoids
// that.
//
//   bun packages/tests/unshielded-only-swap-e2e.ts

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { encodeOffer } from "mip-zswap-offer";
import pg from "pg";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";

import { joinOfferFiles, mintUnshielded } from "./lib/offer-files.ts";
import {
  buildWallet,
  shieldedKeys,
  unshieldedAddressObj,
  waitForSync,
  waitForUnshielded,
  unshieldedBalances,
} from "./lib/wallet.ts";
import { describeImbalances, nonDustImbalances, settleViaBatcher } from "./lib/batcher.ts";
import { submitOffer } from "./lib/api.ts";

globalThis.WebSocket = WebSocket;
setNetworkId(net.id as any);

const TAG = "[unshielded-only]";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEP = { U0: 0xd0, U1: 0xd1 } as const;
const MINT = 1_000_000_000n;
const AMT = 1_000n;
const M0_SEED = "0000000000000000000000000000000000000000000000000000000000000050";
const M1_SEED = "0000000000000000000000000000000000000000000000000000000000000051";

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

const before = {
  spent_unshielded: await count("spent_unshielded"),
  created_unshielded: await count("created_unshielded"),
  offers: await count("offer_file"),
};
console.log(`${TAG} before:`, JSON.stringify(before));

console.log(`${TAG} building genesis (minter) + M0 (maker) + M1 (taker)…`);
const genesis = await buildWallet(net.walletSeed);
const m0 = await buildWallet(M0_SEED);
const m1 = await buildWallet(M1_SEED);
try {
  await waitForSync(genesis, { requireUnshieldedFunds: true });
  try {
    await registerNightForDust(genesis as any);
  } catch (e) {
    console.warn(`${TAG} registerNightForDust: ${e instanceof Error ? e.message : String(e)} (continuing)`);
  }
  await waitForSync(m0).catch(() => {});
  await waitForSync(m1).catch(() => {});

  const m0Unshielded = unshieldedAddressObj(m0);
  const m1Unshielded = unshieldedAddressObj(m1);

  // ── Mint U0 → M0, U1 → M1 (unshielded, directly to each wallet) ──
  console.log(`${TAG} minting U0→M0, U1→M1…`);
  const deployed = await joinOfferFiles(genesis);
  const U0 = await mintUnshielded(deployed, SEP.U0, MINT, m0.unshieldedAddress);
  const U1 = await mintUnshielded(deployed, SEP.U1, MINT, m1.unshieldedAddress);
  console.log(`${TAG} U0=${U0.slice(0, 12)}…(→M0)  U1=${U1.slice(0, 12)}…(→M1)`);

  const createdOk = await waitFor("created_unshielded grew", async () => (await count("created_unshielded")) >= before.created_unshielded + 2, 24);
  check("U0/U1 minted (UnshieldedCreate primitive)", createdOk);
  const m0HasU0 = (await waitForUnshielded(m0, U0, AMT, 36)) >= AMT;
  const m1HasU1 = (await waitForUnshielded(m1, U1, AMT, 36)) >= AMT;
  check("M0 holds U0, M1 holds U1", m0HasU0 && m1HasU1);

  // ── M0 builds + signs its unshielded swap offer: give U0, want U1 ──
  console.log(`${TAG} M0 building unshielded offer (give U0 / want U1) + signing intent…`);
  const recipe = await m0.wallet.initSwap(
    { unshielded: { [U0]: AMT } } as any,
    [{ type: "unshielded", outputs: [{ type: U1, amount: AMT, receiverAddress: m0Unshielded }] } as any],
    shieldedKeys(m0),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const signedRecipe = await (m0.wallet as any).signRecipe(recipe, (p: Uint8Array) => m0.unshieldedKeystore.signData(p));
  const offer0 = await m0.wallet.finalizeRecipe(signedRecipe);

  // sanity: validator should see a real swap (give U0 / want U1), not give-only
  console.log(`${TAG} offer imbalances (expect give U0 + want U1): ${describeImbalances(offer0 as any)}`);

  // ── Index it via the API (proves the unshielded existence/spend legs at the gate) ──
  const blob = encodeOffer(offer0.serialize());
  let sub = await submitOffer(blob);
  for (let r = 0; r < 24 && sub.status === 400 && (sub.body?.error === "UTXO_UNKNOWN" || sub.body?.error === "ROOT_UNKNOWN"); r++) {
    await sleep(5000);
    sub = await submitOffer(blob);
  }
  check("unshielded offer accepted by submit gate (real swap, not NOT_A_SWAP)", sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.body?.error ?? "")} ${String(sub.body?.reason ?? "").slice(0, 80)}`);
  const indexedOk = await waitFor("offer indexed", async () => (await count("offer_file")) > before.offers, 24);
  const offerRow = (await db<{ id: number }>(`SELECT id FROM offer_file ORDER BY id DESC LIMIT 1`))[0];
  check("unshielded offer indexed via Celestia → STM", indexedOk, `id=${offerRow?.id}`);

  // ── M1 (taker) balances the offer with unshielded ONLY (provides U1, takes
  //    U0; NO dust — the batcher pays), signs its unshielded input, finalizes ──
  console.log(`${TAG} M1 (taker) balancing unshielded-only (provides U1, takes U0, no dust)…`);
  const balRecipe = await (m1.wallet as any).balanceFinalizedTransaction(offer0, shieldedKeys(m1), {
    ttl: new Date(Date.now() + 30 * 60_000),
    tokenKindsToBalance: ["unshielded"],
  });
  const balSigned = await (m1.wallet as any).signRecipe(balRecipe, (p: Uint8Array) => m1.unshieldedKeystore.signData(p));
  const balancedTx = await m1.wallet.finalizeRecipe(balSigned);
  console.log(`${TAG} balanced tx imbalances (token side should be empty): ${describeImbalances(balancedTx as any)}`);
  check("taker produced a token-balanced tx (only dust left for the batcher)", nonDustImbalances(balancedTx as any).length === 0);

  // ── Batcher adds dust + submits ──
  const settle = await settleViaBatcher(balancedTx as any);
  check("batcher settled unshielded swap (batcher pays dust)", settle.ok, `status=${settle.status} ${JSON.stringify(settle.body)?.slice(0, 160)}`);

  // ── Effects: both unshielded UTXOs consumed → spent_unshielded += 2; offer archived; balances swapped ──
  const spentOk = await waitFor("spent_unshielded += 2", async () => (await count("spent_unshielded")) >= before.spent_unshielded + 2, 36);
  check("spent_unshielded grew by 2 (both legs consumed)", spentOk, `before=${before.spent_unshielded} now=${await count("spent_unshielded")}`);
  const archivedOk = await waitFor("offer archived", async () => (await db(`SELECT id FROM offer_file WHERE id = ${offerRow.id}`)).length === 0, 24);
  check("offer ARCHIVED after settlement", archivedOk);
  check("M0 received U1 (wanted token)", (await waitForUnshielded(m0, U1, AMT, 24)) >= AMT);
  check("M1 received U0 (wanted token)", (await waitForUnshielded(m1, U0, AMT, 24)) >= AMT);

  console.log(`${TAG} M0 unshielded: ${JSON.stringify(Object.fromEntries(Object.entries(await unshieldedBalances(m0)).map(([k, v]) => [k.slice(0, 8), String(v)])))}`);
  console.log(`${TAG} M1 unshielded: ${JSON.stringify(Object.fromEntries(Object.entries(await unshieldedBalances(m1)).map(([k, v]) => [k.slice(0, 8), String(v)])))}`);
} finally {
  await m0.wallet.stop().catch(() => {});
  await m1.wallet.stop().catch(() => {});
  await genesis.wallet.stop().catch(() => {});
}

console.log(failures === 0 ? `\n${TAG} ✅ UNSHIELDED-ONLY SWAP PASS` : `\n${TAG} ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
