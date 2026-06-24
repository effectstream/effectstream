// Full swap lifecycle folded into the Phase-B runner.
// Mirrors full-lifecycle-e2e.ts but uses the shared DB client and assert()
// from helpers. Infra is already up when this runs (Phase A verified it).
//
// Flow: mint test tokens → build genesis wallet → create A↔B offer
//   → /api/zswap/submit → wait for Celestia indexing
//   → balance + settle on Midnight → nullifier consumed → offer ARCHIVED.

import type { Client } from "pg";
import { assert, API_PORT } from "../helpers.ts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Transaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer, encodeOffer } from "mip-zswap-offer";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import { mintTestTokens } from "../../contracts-midnight/mint-test-tokens.ts";

globalThis.WebSocket = WebSocket;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GIVE_AMOUNT = 500_000n;
const WANT_AMOUNT = 750_000n;

export async function zswapFlowTest(db: Client): Promise<void> {
  setNetworkId(net.id as any);

  const API = `http://127.0.0.1:${API_PORT}`;

  const count = async (t: string): Promise<number> =>
    Number((await db.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n);

  async function waitFor(
    name: string,
    fn: () => Promise<boolean>,
    tries = 36,
    ms = 5000,
  ): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      if (await fn()) return true;
      await sleep(ms);
    }
    console.log(`  (waitFor "${name}" timed out after ${(tries * ms) / 1000}s)`);
    return false;
  }

  async function submitOfferHttp(blob: string): Promise<{ status: number; body: any }> {
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
  console.log("[lifecycle] before:", JSON.stringify(before));

  // ── 1. Mint test tokens ──
  console.log("[lifecycle] minting test tokens via the offer-files contract…");
  const colors = await mintTestTokens();
  console.log("[lifecycle] minted colors:", JSON.stringify(colors));
  const createdOk = await waitFor(
    "created_unshielded > 0",
    async () => (await count("created_unshielded")) > 0,
    24,
  );
  await assert("created_unshielded populated (UnshieldedCreate primitive live)", async () => createdOk);

  // ── 2. Build genesis wallet and wait for minted colors ──
  console.log("[lifecycle] building genesis wallet…");
  const result = await buildWalletAndWaitForFunds(
    {
      id: net.id,
      indexer: net.indexer,
      indexerWS: net.indexerWS,
      node: net.node,
      proofServer: net.proofServer,
    } as any,
    net.walletSeed,
    net.id as any,
  );
  const { wallet, zswapSecretKeys, dustSecretKey } = result;
  const keys = { shieldedSecretKeys: zswapSecretKeys, dustSecretKey };

  try {
    const haveMinted = await waitFor(
      "wallet sees minted colors",
      async () => {
        const st = await wallet.shielded.waitForSyncedState();
        const b = st.balances as Record<string, bigint>;
        return (b[colors.shieldedA] ?? 0n) >= GIVE_AMOUNT && (b[colors.shieldedB] ?? 0n) > 0n;
      },
      24,
    );
    await assert("genesis wallet holds both minted shielded colors", async () => haveMinted);

    const address = await wallet.shielded.getAddress();
    const recipe = await wallet.initSwap(
      { shielded: { [colors.shieldedA]: GIVE_AMOUNT } },
      [
        {
          type: "shielded",
          outputs: [{ type: colors.shieldedB, amount: WANT_AMOUNT, receiverAddress: address }],
        } as any,
      ],
      keys,
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    const offerFinalized = await wallet.finalizeTransaction(recipe.transaction);
    const blob = encodeOffer(offerFinalized.serialize());
    console.log(
      `[lifecycle] offer: give ${GIVE_AMOUNT} of A(${colors.shieldedA.slice(0, 8)}…), ` +
        `want ${WANT_AMOUNT} of B(${colors.shieldedB.slice(0, 8)}…)`,
    );

    // ── 3. Submit → batcher → Celestia ──
    let sub = await submitOfferHttp(blob);
    for (let r = 0; r < 24 && sub.status === 400 && sub.body?.error === "ROOT_UNKNOWN"; r++) {
      await sleep(5000);
      sub = await submitOfferHttp(blob);
    }
    await assert(
      "offer accepted by submit gate (crypto + liveness + root-known)",
      async () => sub.status === 200,
    );

    // ── 4. Indexed by celestia-zswap ──
    const indexedOk = await waitFor(
      "offer indexed",
      async () => (await count("offer_file")) > before.offers,
      24,
    );
    await assert("offer indexed via Celestia → STM ingestion", async () => indexedOk);
    if (!indexedOk) return;

    const offerRow = (
      await db.query("SELECT id FROM offer_file ORDER BY id DESC LIMIT 1")
    ).rows[0];
    if (!offerRow) return;

    // ── 5. Taker settles: balance + submit to Midnight ──
    console.log("[lifecycle] balancing + settling the A↔B offer on Midnight…");
    const offerTx = Transaction.deserialize("signature", "proof", "binding", decodeOffer(blob));
    const balRecipe = await (wallet as any).balanceFinalizedTransaction(offerTx, keys, {
      ttl: new Date(Date.now() + 30 * 60_000),
    });
    const settleTx = await wallet.finalizeRecipe(balRecipe);
    await (wallet as any).submitTransaction(settleTx);
    console.log(
      "[lifecycle] settle submitted:",
      settleTx.transactionHash?.().toString?.().slice(0, 24) ?? "(tx)",
    );

    // ── 6. Nullifier consumed → spent_nullifiers + offer archived ──
    const spentOk = await waitFor(
      "spent_nullifiers > before",
      async () => (await count("spent_nullifiers")) > before.spent_nullifiers,
      36,
    );
    await assert("spent_nullifiers populated (Nullifier primitive live)", async () => spentOk);

    const archivedOk = await waitFor(
      "offer archived",
      async () => {
        const active = (await db.query("SELECT id FROM offer_file WHERE id = $1", [offerRow.id])).rows;
        const hist = (
          await db.query("SELECT id FROM offer_file_history WHERE id = $1", [offerRow.id])
        ).rows;
        return active.length === 0 && hist.length === 1;
      },
      24,
    );
    await assert("offer ARCHIVED after settlement (lifecycle closed)", async () => archivedOk);

    // ── 7. Root advanced ──
    const rootsNow = await count("known_roots");
    await assert(
      "known_roots advanced (ZswapRoot primitive live)",
      async () => rootsNow > before.known_roots,
    );

    const after = {
      known_roots: await count("known_roots"),
      created_unshielded: await count("created_unshielded"),
      spent_nullifiers: await count("spent_nullifiers"),
    };
    console.log("[lifecycle] after:", JSON.stringify(after));
  } finally {
    await wallet.stop().catch(() => {});
  }
}
