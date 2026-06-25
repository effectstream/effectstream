// TWO-WALLET ZSwap e2e against a RUNNING dev stack (`bun run dev`):
//
//   1. genesis wallet (funded) syncs + registers NIGHT→dust
//   2. mint four colors via the offer-files contract:
//        ZToken, XToken → SHIELDED (minted to genesis, the caller)
//        AToken, BToken → UNSHIELDED (A → maker, B → genesis)
//   3. genesis shielded-transfers ZToken to a fresh MAKER wallet
//   4. MAKER creates an UNBALANCED swap offer  +X / -Z  (give Z, want X),
//      payFees:false → maker needs no dust
//   5. /api/zswap/submit  (crypto + liveness + root-known) → batcher → Celestia
//   6. celestia-zswap ingestion indexes the offer (offer_file)
//   7. genesis (the TAKER — holds X + dust) balances + settles on Midnight
//   8. nullifier consumed → spent_nullifiers + offer ARCHIVED; MAKER now holds X
//
// This is the minimal cross-wallet swap: maker = fresh wallet, taker = the
// dust-bearing genesis wallet. Run it with the dev orchestrator up:
//
//   bun packages/tests/two-wallet-swap-e2e.ts

import { Transaction } from "@midnight-ntwrk/ledger-v8";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { decodeOffer, encodeOffer } from "mip-zswap-offer";
import pg from "pg";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";

import { joinOfferFiles, mintShielded, mintUnshielded } from "./lib/offer-files.ts";
import {
  buildWallet,
  shieldedBalances,
  shieldedKeys,
  transferShielded,
  waitForShielded,
  waitForSync,
} from "./lib/wallet.ts";

globalThis.WebSocket = WebSocket;
setNetworkId(net.id as any);

const API = "http://127.0.0.1:9999";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Token domain separators (one byte, filled to 32). Distinct from the startup
// mint's 0xa1/0xb2/0xc3 so we never collide with its colors.
const SEP = { Z: 0x5a, X: 0x58, A: 0x41, B: 0x42 } as const;
const MINT_AMOUNT = 1_000_000_000n;
const Z_TO_MAKER = 10_000_000n; // genesis → maker, enough to cover the give
const GIVE_Z = 500_000n; // maker gives Z
const WANT_X = 750_000n; // maker wants X
const MAKER_SEED = "0000000000000000000000000000000000000000000000000000000000000002";

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
  known_roots: await count("known_roots"),
  created_unshielded: await count("created_unshielded"),
  spent_nullifiers: await count("spent_nullifiers"),
  offers: await count("offer_file"),
};
console.log("[2wallet] before:", JSON.stringify(before));

// ── 1. Genesis wallet: sync + register for dust (pays mint/settle fees) ──
console.log("[2wallet] building genesis wallet (taker / minter)…");
const genesis = await buildWallet(net.walletSeed);
const maker = await buildWallet(MAKER_SEED);
try {
  await waitForSync(genesis, { requireUnshieldedFunds: true });
  console.log("[2wallet] genesis synced; registering NIGHT→dust…");
  try {
    await registerNightForDust(genesis as any);
  } catch (e) {
    console.warn(`[2wallet] registerNightForDust: ${e instanceof Error ? e.message : String(e)} (continuing)`);
  }

  const makerShieldedAddr = await maker.wallet.shielded.getAddress();
  console.log(`[2wallet] maker unshielded=${maker.unshieldedAddress.slice(0, 24)}…`);

  // ── 2. Mint four colors via the offer-files contract ──
  console.log("[2wallet] joining offer-files contract + minting Z/X (shielded) and A/B (unshielded)…");
  const deployed = await joinOfferFiles(genesis);
  const nonce = BigInt(Date.now());
  const Z = await mintShielded(deployed, SEP.Z, MINT_AMOUNT, nonce + 0n);
  const X = await mintShielded(deployed, SEP.X, MINT_AMOUNT, nonce + 1n);
  const A = await mintUnshielded(deployed, SEP.A, MINT_AMOUNT, maker.unshieldedAddress);
  const B = await mintUnshielded(deployed, SEP.B, MINT_AMOUNT, genesis.unshieldedAddress);
  console.log(
    `[2wallet] minted Z=${Z.slice(0, 12)}… X=${X.slice(0, 12)}… A=${A.slice(0, 12)}… B=${B.slice(0, 12)}…`,
  );
  check("ZToken/XToken minted (shielded)", !!Z && !!X);
  check("AToken/BToken minted (unshielded)", !!A && !!B);

  const createdOk = await waitFor("created_unshielded grew", async () => (await count("created_unshielded")) > before.created_unshielded, 24);
  check("created_unshielded populated by A/B mints (UnshieldedCreate primitive live)", createdOk, `before=${before.created_unshielded} now=${await count("created_unshielded")}`);

  // genesis must actually see the freshly-minted Z before it can transfer it
  const gZ = await waitForShielded(genesis, Z, GIVE_Z, 24);
  check("genesis holds minted ZToken", gZ >= GIVE_Z, `bal=${gZ}`);

  // ── 3. Move ZToken to the fresh MAKER wallet (genesis pays the fee) ──
  console.log(`[2wallet] transferring ${Z_TO_MAKER} ZToken genesis → maker…`);
  await transferShielded(genesis, Z, Z_TO_MAKER, makerShieldedAddr);
  const makerZ = await waitForShielded(maker, Z, GIVE_Z, 36);
  check("maker received ZToken (shielded transfer landed)", makerZ >= GIVE_Z, `bal=${makerZ}`);

  // ── 4. MAKER builds the UNBALANCED offer:  +X / -Z  (give Z, want X) ──
  console.log(`[2wallet] maker building unbalanced offer: give ${GIVE_Z} Z, want ${WANT_X} X…`);
  const recipe = await maker.wallet.initSwap(
    { shielded: { [Z]: GIVE_Z } },
    [{ type: "shielded", outputs: [{ type: X, amount: WANT_X, receiverAddress: makerShieldedAddr }] } as any],
    shieldedKeys(maker),
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const offerFinalized = await maker.wallet.finalizeTransaction(recipe.transaction);
  const blob = encodeOffer(offerFinalized.serialize());

  // ── 5. Submit → batcher → Celestia (retry while the node syncs the root) ──
  let sub = await submitOffer(blob);
  for (let i = 0; i < 24 && sub.status === 400 && sub.body?.error === "ROOT_UNKNOWN"; i++) {
    await sleep(5000);
    sub = await submitOffer(blob);
  }
  check("unbalanced +X/-Z offer accepted by submit gate", sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.body?.error ?? "")}`);

  // ── 6. Indexed by celestia-zswap ──
  const indexedOk = await waitFor("offer indexed", async () => (await count("offer_file")) > before.offers, 24);
  const offerRow = (await db(`SELECT id FROM offer_file ORDER BY id DESC LIMIT 1`))[0];
  check("offer indexed via Celestia → STM ingestion", indexedOk, `offer_file id=${offerRow?.id}`);

  // ── 7. TAKER (genesis: holds X + dust) balances + settles on Midnight ──
  console.log("[2wallet] genesis (taker) balancing + settling the offer…");
  const offerTx = Transaction.deserialize("signature", "proof", "binding", decodeOffer(blob));
  const balRecipe = await (genesis.wallet as any).balanceFinalizedTransaction(offerTx, shieldedKeys(genesis), {
    ttl: new Date(Date.now() + 30 * 60_000),
  });
  const settleTx = await genesis.wallet.finalizeRecipe(balRecipe);
  await (genesis.wallet as any).submitTransaction(settleTx);
  console.log("[2wallet] settle submitted.");

  // ── 8. Nullifier consumed → spent_nullifiers + offer archived ──
  const spentOk = await waitFor("spent_nullifiers grew", async () => (await count("spent_nullifiers")) > before.spent_nullifiers, 36);
  check("spent_nullifiers populated (Nullifier primitive live)", spentOk, `now=${await count("spent_nullifiers")}`);

  const archivedOk = await waitFor("offer archived", async () => {
    const active = await db(`SELECT id FROM offer_file WHERE id = ${offerRow.id}`);
    const hist = await db(`SELECT id FROM offer_file_history WHERE id = ${offerRow.id}`);
    return active.length === 0 && hist.length === 1;
  }, 24);
  const hist = (await db(`SELECT archive_reason FROM offer_file_history ORDER BY id DESC LIMIT 1`))[0];
  check("offer ARCHIVED after settlement", archivedOk, `reason=${hist?.archive_reason}`);

  // ── 9. The swap actually happened: maker now holds XToken ──
  const makerX = await waitForShielded(maker, X, WANT_X, 24);
  check("maker received XToken (swap completed: +X / -Z)", makerX >= WANT_X, `X bal=${makerX}`);
  const gBalances = await shieldedBalances(genesis);
  console.log(`[2wallet] genesis Z balance after swap: ${gBalances[Z] ?? 0n}`);
} finally {
  await maker.wallet.stop().catch(() => {});
  await genesis.wallet.stop().catch(() => {});
}

console.log(failures === 0 ? "\n[2wallet] ✅ TWO-WALLET SWAP PASS" : `\n[2wallet] ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
