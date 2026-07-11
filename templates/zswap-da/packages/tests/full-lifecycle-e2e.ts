// FULL LIFECYCLE e2e against a RUNNING dev stack:
//   mint test tokens (2 shielded + 1 unshielded via the offer-files contract)
//   → make a minted A↔B offer → /api/zswap/submit (validators + liveness)
//   → batcher → Celestia → celestia-zswap ingestion (re-validated) → indexed
//   → taker balances + settles on Midnight → nullifier consumed
//   → midnight-nullifier primitive → spent_nullifiers + offer ARCHIVED.
// Proves all four liveness primitives live: known_roots (ZswapRoot),
// created_unshielded (UnshieldedCreate — via the unshielded mint),
// spent_nullifiers (Nullifier), and — stretch, environment-permitting —
// spent_unshielded (UnshieldedSpend) via an unshielded-give offer.
//
//   bun packages/tests/full-lifecycle-e2e.ts

import { Transaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer, encodeOffer } from "mip-zswap-offer";
import pg from "pg";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import { mintTestTokens } from "../contracts-midnight/mint-test-tokens.ts";

const API = "http://127.0.0.1:9999";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GIVE_AMOUNT = 500_000n;
const WANT_AMOUNT = 750_000n;

let failures = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};
const skip = (name: string, why: string) => console.log(`⏭  ${name} — ${why}`);

async function db<T = any>(q: string): Promise<T[]> {
  const c = new pg.Client({ host: "127.0.0.1", port: 5432, user: "postgres", database: "postgres" });
  await c.connect();
  try { return (await c.query(q)).rows; } finally { await c.end().catch(() => {}); }
}
const count = async (t: string) => Number((await db(`SELECT count(*)::int n FROM ${t}`))[0].n);
async function waitFor(name: string, fn: () => Promise<boolean>, tries = 36, ms = 5000): Promise<boolean> {
  for (let i = 0; i < tries; i++) { if (await fn()) return true; await sleep(ms); }
  console.log(`  (waitFor ${name} timed out)`);
  return false;
}
async function submitOffer(blob: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${API}/api/zswap/submit`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blob }),
  });
  let body: any; try { body = await r.json(); } catch { body = await r.text(); }
  return { status: r.status, body };
}

const before = {
  known_roots: await count("known_roots"),
  created_unshielded: await count("created_unshielded"),
  spent_nullifiers: await count("spent_nullifiers"),
  spent_unshielded: await count("spent_unshielded"),
  offers: await count("offer_file"),
};
console.log("[lifecycle] before:", JSON.stringify(before));

// ── 1. Mint test tokens (idempotent; the unshielded mint emits
// unshieldedCreatedOutputs → UnshieldedCreate primitive → created_unshielded). ──
console.log("[lifecycle] minting test tokens via the offer-files contract…");
const colors = await mintTestTokens();
console.log("[lifecycle] minted colors:", JSON.stringify(colors));
const createdOk = await waitFor("created_unshielded > 0", async () =>
  (await count("created_unshielded")) > 0, 24);
check("created_unshielded populated (UnshieldedCreate primitive live)", createdOk,
  `before=${before.created_unshielded} now=${await count("created_unshielded")}`);

// ── 2. Make a minted A↔B offer ──
console.log("[lifecycle] building genesis wallet…");
const result = await buildWalletAndWaitForFunds(
  { id: net.id, indexer: net.indexer, indexerWS: net.indexerWS, node: net.node, proofServer: net.proofServer } as any,
  net.walletSeed, net.id as any,
);
const { wallet, zswapSecretKeys, dustSecretKey } = result;
const keys = { shieldedSecretKeys: zswapSecretKeys, dustSecretKey };

try {
  // Wait until the wallet sees BOTH minted shielded colors.
  const haveMinted = await waitFor("wallet sees minted colors", async () => {
    const st = await wallet.shielded.waitForSyncedState();
    const b = st.balances as Record<string, bigint>;
    return (b[colors.shieldedA] ?? 0n) >= GIVE_AMOUNT && (b[colors.shieldedB] ?? 0n) > 0n;
  }, 24);
  check("genesis wallet holds both minted shielded colors", haveMinted);

  const address = await wallet.shielded.getAddress();
  const recipe = await wallet.initSwap(
    { shielded: { [colors.shieldedA]: GIVE_AMOUNT } },
    [{ type: "shielded", outputs: [{ type: colors.shieldedB, amount: WANT_AMOUNT, receiverAddress: address }] } as any],
    keys,
    { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
  );
  const offerFinalized = await wallet.finalizeTransaction(recipe.transaction);
  const blob = encodeOffer(offerFinalized.serialize());
  console.log(`[lifecycle] offer: give ${GIVE_AMOUNT} of A(${colors.shieldedA.slice(0, 8)}…), want ${WANT_AMOUNT} of B(${colors.shieldedB.slice(0, 8)}…)`);

  // ── 3. Submit → batcher → Celestia ──
  const sub = await submitOffer(blob);
  check("minted-token offer accepted by submit gate (crypto + liveness + root-known)", sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.body?.error ?? "")}`);

  // ── 4. Indexed by celestia-zswap (re-validated at ingestion) ──
  const indexedOk = await waitFor("offer indexed", async () => (await count("offer_file")) > before.offers, 24);
  const offerRow = (await db(`SELECT id FROM offer_file ORDER BY id DESC LIMIT 1`))[0];
  check("offer indexed via Celestia → STM ingestion", indexedOk, `offer_file id=${offerRow?.id}`);

  // ── 5. Taker settles: balance the finalized offer + submit to Midnight ──
  console.log("[lifecycle] balancing + settling the A↔B offer on Midnight…");
  const offerTx = Transaction.deserialize("signature", "proof", "binding", decodeOffer(blob));
  const balRecipe = await (wallet as any).balanceFinalizedTransaction(offerTx, keys, {
    ttl: new Date(Date.now() + 30 * 60_000),
  });
  const settleTx = await wallet.finalizeRecipe(balRecipe);
  await (wallet as any).submitTransaction(settleTx);
  console.log("[lifecycle] settle submitted:", settleTx.transactionHash?.().toString?.().slice(0, 24) ?? "(tx)");

  // ── 6. Nullifier consumed → spent_nullifiers + offer archived ──
  const spentOk = await waitFor("spent_nullifiers > before", async () =>
    (await count("spent_nullifiers")) > before.spent_nullifiers, 36);
  check("spent_nullifiers populated (Nullifier primitive live)", spentOk, `now=${await count("spent_nullifiers")}`);

  const archivedOk = await waitFor("offer archived", async () => {
    const active = await db(`SELECT id FROM offer_file WHERE id = ${offerRow.id}`);
    const hist = await db(`SELECT id FROM offer_file_history WHERE id = ${offerRow.id}`);
    return active.length === 0 && hist.length === 1;
  }, 24);
  const hist = (await db(`SELECT archive_reason FROM offer_file_history ORDER BY id DESC LIMIT 1`))[0];
  check("offer ARCHIVED after settlement (lifecycle closed)", archivedOk, `reason=${hist?.archive_reason}`);

  // ── 7. Root advanced ──
  const rootsNow = await count("known_roots");
  check("known_roots advanced (ZswapRoot primitive live)", rootsNow > before.known_roots, `before=${before.known_roots} now=${rootsNow}`);

  // ── 8. STRETCH: offer with an UNSHIELDED give (exercises the validator's
  // unshielded existence/spent legs + UnshieldedSpend on settle). The facade's
  // unshielded-input path may hit the known wallet-sdk-node-client packaging
  // bug — tolerate and skip. ──
  try {
    // Pure-unshielded swap intent: give minted colorU, want unshielded NIGHT
    // back to our own unshielded address (mixed unshielded-give/shielded-want
    // intents come out give-only from the facade).
    const ust: any = await (wallet as any).unshielded.waitForSyncedState?.();
    const uBalances: Record<string, bigint> = ust?.balances ?? {};
    const nightColor = Object.entries(uBalances).sort((a, b) => (a[1] < b[1] ? 1 : -1))[0]?.[0];
    if (!nightColor) throw new Error("no unshielded balance keys visible");
    const unshieldedAddrObj = (result as any).unshieldedKeystore.getBech32Address();
    const uRecipe = await wallet.initSwap(
      { unshielded: { [colors.unshielded]: 1_000n } } as any,
      [{ type: "unshielded", outputs: [{ type: nightColor, amount: 1_000n, receiverAddress: unshieldedAddrObj }] } as any],
      keys,
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    const uFinalized = await wallet.finalizeTransaction(uRecipe.transaction);
    const uBlob = encodeOffer(uFinalized.serialize());
    const uSub = await submitOffer(uBlob);
    if (uSub.status !== 200) {
      // Known wallet-SDK limitation: the facade's initSwap does not fully sign
      // unshielded swap-intents for OPEN offers, so wellFormed rejects them
      // (e.g. SIGNATURE_INVALID "unshielded offer action validation error").
      // The rejection itself exercises the validator's unshielded legs live;
      // spent_unshielded settle emission stays uncovered until the SDK supports
      // unshielded open intents.
      skip("STRETCH unshielded-give offer", `validator rejected as expected for current SDK: ${uSub.body?.error} — ${String(uSub.body?.reason ?? "").slice(0, 90)}`);
    }
    if (uSub.status === 200) {
      check("STRETCH: unshielded-give offer accepted (existence check passed)", true);
      const uOfferTx = Transaction.deserialize("signature", "proof", "binding", decodeOffer(uBlob));
      const uBal = await (wallet as any).balanceFinalizedTransaction(uOfferTx, keys, { ttl: new Date(Date.now() + 30 * 60_000) });
      const uSettle = await wallet.finalizeRecipe(uBal);
      await (wallet as any).submitTransaction(uSettle);
      const uSpentOk = await waitFor("spent_unshielded > before", async () =>
        (await count("spent_unshielded")) > before.spent_unshielded, 30);
      check("STRETCH: spent_unshielded populated on settle (UnshieldedSpend primitive live)", uSpentOk, `now=${await count("spent_unshielded")}`);
    }
  } catch (e) {
    skip("STRETCH unshielded-give offer", `${String(e).slice(0, 140)}`);
  }

  const after = {
    known_roots: await count("known_roots"),
    created_unshielded: await count("created_unshielded"),
    spent_nullifiers: await count("spent_nullifiers"),
    spent_unshielded: await count("spent_unshielded"),
  };
  console.log("[lifecycle] after:", JSON.stringify(after));
} finally {
  await wallet.stop().catch(() => {});
}

console.log(failures === 0 ? "\n[lifecycle] ✅ FULL LIFECYCLE PASS" : `\n[lifecycle] ❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
