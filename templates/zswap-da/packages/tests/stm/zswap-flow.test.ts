// Automated Phase-B lifecycle: proves the zswap system end-to-end against the
// running stack (test or dev — both expose the API on :9999 and Postgres on
// :5432):
//   mint test tokens (offer-files circuits; UnshieldedCreate → created_unshielded)
//   → genesis wallet builds a real A↔B shielded offer (initSwap + finalize)
//   → POST /api/zswap/submit (crypto + liveness + root-known gate)
//   → batcher → Celestia → celestia-zswap ingestion (re-validated) → offer_file
//   → taker balances + settles on Midnight → nullifier consumed
//   → midnight-nullifier primitive → spent_nullifiers → offer ARCHIVED (CONSUMED)
//   → known_roots advanced (ZswapRoot primitive).
//
// Counts are delta-based so the same function also runs against a dev DB with
// history (see ../full-lifecycle-e2e.ts, which adds the STRETCH unshielded
// leg). Load-bearing milestones fail fast: once one fails, the remaining waits
// are doomed, so we record the failure and return early with `blob: null`.

import type { Client } from "pg";
import { Transaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer, encodeOffer } from "mip-zswap-offer";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import {
  mintTestTokens,
  type MintedTestTokens,
} from "../../contracts-midnight/mint-test-tokens.ts";
import { API_PORT, assert } from "../helpers.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const GIVE_AMOUNT = 500_000n;
const WANT_AMOUNT = 750_000n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ZswapFlowResult {
  blob: string | null;
  colors: MintedTestTokens | null;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function waitFor(
  name: string,
  fn: () => Promise<boolean>,
  tries = 24,
  ms = 5000,
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      if (await fn()) return true;
    } catch {
      // table not migrated yet / transient API error — retry
    }
    await sleep(ms);
  }
  console.log(`  (waitFor ${name} timed out after ${tries} tries)`);
  return false;
}

async function count(db: Client, table: string): Promise<number> {
  const res = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(res.rows[0].n);
}

async function snapshotCounts(db: Client) {
  return {
    known_roots: await count(db, "known_roots"),
    created_unshielded: await count(db, "created_unshielded"),
    spent_nullifiers: await count(db, "spent_nullifiers"),
    spent_unshielded: await count(db, "spent_unshielded"),
    offers: await count(db, "offer_file"),
  };
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

export async function zswapFlowTest(
  db: Client,
  opts: { stretch?: boolean } = {},
): Promise<ZswapFlowResult> {
  // ── 0. Tables queryable (node migrations applied) + baseline counts ──
  let beforeSnap: Awaited<ReturnType<typeof snapshotCounts>> | null = null;
  const tablesOk = await assert(
    "liveness + offer tables are queryable (migrations applied)",
    async () =>
      waitFor(
        "tables queryable",
        async () => {
          beforeSnap = await snapshotCounts(db);
          return true;
        },
        24,
        2000,
      ),
  );
  if (!tablesOk || beforeSnap === null) return { blob: null, colors: null };
  const before = beforeSnap!;
  console.log("[flow] before:", JSON.stringify(before));

  // ── 1. Mint test tokens (idempotent; the unshielded mint emits
  // unshieldedCreatedOutputs → UnshieldedCreate primitive). Minutes of ZK
  // proving — the proof server does the heavy lifting here. ──
  console.log("[flow] minting test tokens via the offer-files contract…");
  let minted: MintedTestTokens | null = null;
  const mintOk = await assert(
    "mint test tokens (2 shielded + 1 unshielded) via contract circuits",
    async () => {
      minted = await mintTestTokens();
      return Boolean(minted.shieldedA && minted.shieldedB && minted.unshielded);
    },
  );
  if (!mintOk || minted === null) return { blob: null, colors: null };
  const colors = minted as MintedTestTokens;
  console.log("[flow] minted colors:", JSON.stringify(colors));

  await assert(
    "created_unshielded grew after mint (UnshieldedCreate primitive live)",
    async () =>
      waitFor(
        "created_unshielded > before",
        async () => (await count(db, "created_unshielded")) > before.created_unshielded,
        24,
      ),
  );

  // ── 2. Genesis wallet ──
  console.log("[flow] building genesis wallet…");
  let walletResult: any = null;
  const walletOk = await assert("genesis wallet builds and sees funds", async () => {
    walletResult = await withTimeout(
      buildWalletAndWaitForFunds(
        {
          id: net.id,
          indexer: net.indexer,
          indexerWS: net.indexerWS,
          node: net.node,
          proofServer: net.proofServer,
        } as any,
        net.walletSeed,
        net.id as any,
      ),
      300_000,
      "buildWalletAndWaitForFunds",
    );
    return walletResult?.wallet != null;
  });
  if (!walletOk || walletResult === null) return { blob: null, colors };

  const { wallet, zswapSecretKeys, dustSecretKey } = walletResult;
  const keys = { shieldedSecretKeys: zswapSecretKeys, dustSecretKey };

  try {
    // ── 3. Wallet sees both minted colors ──
    const haveMinted = await assert(
      "genesis wallet holds both minted shielded colors",
      async () =>
        waitFor(
          "wallet sees minted colors",
          async () => {
            const st: any = await withTimeout(
              wallet.shielded.waitForSyncedState(),
              60_000,
              "waitForSyncedState",
            );
            const b = (st?.balances ?? {}) as Record<string, bigint>;
            return (
              (b[colors.shieldedA] ?? 0n) >= GIVE_AMOUNT &&
              (b[colors.shieldedB] ?? 0n) > 0n
            );
          },
          24,
        ),
    );
    if (!haveMinted) return { blob: null, colors };

    // ── 4. Build the A↔B offer ──
    let builtBlob: string | null = null;
    const offerOk = await assert(
      "offer builds (initSwap + finalizeTransaction → bech32m blob)",
      async () => {
        const address = await wallet.shielded.getAddress();
        const recipe = await wallet.initSwap(
          { shielded: { [colors.shieldedA]: GIVE_AMOUNT } },
          [
            {
              type: "shielded",
              outputs: [
                {
                  type: colors.shieldedB,
                  amount: WANT_AMOUNT,
                  receiverAddress: address,
                },
              ],
            } as any,
          ],
          keys,
          { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
        );
        const finalized = await wallet.finalizeTransaction(recipe.transaction);
        builtBlob = encodeOffer(finalized.serialize());
        return typeof builtBlob === "string" && builtBlob.length > 0;
      },
    );
    if (!offerOk || builtBlob === null) return { blob: null, colors };
    const blob = builtBlob as string;
    console.log(
      `[flow] offer: give ${GIVE_AMOUNT} of A(${colors.shieldedA.slice(0, 8)}…), want ${WANT_AMOUNT} of B(${colors.shieldedB.slice(0, 8)}…)`,
    );

    // ── 5. Submit → batcher → Celestia ──
    let submitBody: any = null;
    const subOk = await assert(
      "submit gate accepts the offer (crypto + liveness + root-known) and forwards to Celestia",
      async () => {
        const sub = await submitOffer(blob);
        submitBody = sub.body;
        return (
          sub.status === 200 &&
          sub.body?.success === true &&
          Boolean(sub.body?.result?.txhash)
        );
      },
    );
    if (!subOk) {
      console.error("[flow] submit response:", JSON.stringify(submitBody).slice(0, 300));
      return { blob: null, colors };
    }

    // ── 6. Indexed via celestia-zswap ingestion ──
    let offerId: number | string | null = null;
    const indexedOk = await assert(
      "offer indexed via Celestia → STM ingestion (offer_file)",
      async () =>
        waitFor(
          "offer_file grows",
          async () => {
            if ((await count(db, "offer_file")) <= before.offers) return false;
            const rows = (
              await db.query("SELECT id FROM offer_file ORDER BY id DESC LIMIT 1")
            ).rows;
            offerId = rows[0]?.id ?? null;
            return offerId != null;
          },
          36,
        ),
    );
    if (!indexedOk || offerId == null) return { blob: null, colors };
    console.log(`[flow] offer indexed: offer_file id=${offerId}`);

    // ── 7. Listed by the API with the minted give/want colors (ties mint →
    // decode → derive → index together in one check) ──
    await assert(
      "GET /api/zswaps lists the offer with the minted give/want colors",
      async () => {
        const r = await fetch(`${API}/api/zswaps`);
        if (!r.ok) return false;
        const list = (await r.json()) as any[];
        const o = list.find((x) => String(x.id) === String(offerId));
        if (!o) return false;
        const gives = (o.gives ?? []).map((g: any) => g.token);
        const wants = (o.wants ?? []).map((w: any) => w.token);
        return gives.includes(colors.shieldedA) && wants.includes(colors.shieldedB);
      },
    );

    // ── 8. Taker balances + settles on Midnight ──
    const settleOk = await assert(
      "taker balances + settles the offer on Midnight",
      async () => {
        const offerTx = Transaction.deserialize(
          "signature",
          "proof",
          "binding",
          decodeOffer(blob),
        );
        const balRecipe = await (wallet as any).balanceFinalizedTransaction(
          offerTx,
          keys,
          { ttl: new Date(Date.now() + 30 * 60_000) },
        );
        const settleTx = await wallet.finalizeRecipe(balRecipe);
        await (wallet as any).submitTransaction(settleTx);
        return true;
      },
    );
    if (!settleOk) return { blob: null, colors };

    // ── 9. Nullifier consumed → spent_nullifiers ──
    const spentOk = await assert(
      "spent_nullifiers grew (Nullifier primitive live)",
      async () =>
        waitFor(
          "spent_nullifiers > before",
          async () => (await count(db, "spent_nullifiers")) > before.spent_nullifiers,
          36,
        ),
    );
    if (!spentOk) return { blob: null, colors };

    // ── 10. Offer archived as CONSUMED (same STM handler invocation as the
    // spent-nullifier insert, so this should land right behind step 9) ──
    await assert("offer archived to offer_file_history as CONSUMED", async () =>
      waitFor(
        "offer archived",
        async () => {
          const active = await db.query("SELECT id FROM offer_file WHERE id = $1", [
            offerId,
          ]);
          const hist = await db.query(
            "SELECT archive_reason FROM offer_file_history WHERE id = $1",
            [offerId],
          );
          return (
            active.rows.length === 0 &&
            hist.rows.length === 1 &&
            hist.rows[0].archive_reason === "CONSUMED"
          );
        },
        12,
      ),
    );

    await assert("GET /api/zswaps no longer lists the consumed offer", async () => {
      const r = await fetch(`${API}/api/zswaps`);
      if (!r.ok) return false;
      const list = (await r.json()) as any[];
      return !list.some((x) => String(x.id) === String(offerId));
    });

    // ── 11. Roots advanced ──
    await assert("known_roots grew (ZswapRoot primitive live)", async () =>
      waitFor(
        "known_roots > before",
        async () => (await count(db, "known_roots")) > before.known_roots,
        12,
      ),
    );

    // ── STRETCH (manual runs only): unshielded-give offer ──
    if (opts.stretch) {
      await stretchUnshielded(db, wallet, walletResult, keys, colors, before.spent_unshielded);
    }

    return { blob, colors };
  } finally {
    await (wallet as any).stop?.().catch(() => {});
  }
}

// STRETCH: offer with an UNSHIELDED give (exercises the validator's unshielded
// existence/spent legs + UnshieldedSpend on settle). The facade cannot fully
// sign unshielded open intents under the current wallet SDK, so a rejection is
// tolerated and logged rather than failed — manual-only for that reason.
async function stretchUnshielded(
  db: Client,
  wallet: any,
  walletResult: any,
  keys: any,
  colors: MintedTestTokens,
  spentUnshieldedBefore: number,
): Promise<void> {
  const skip = (why: string) =>
    console.log(`⏭  STRETCH unshielded-give offer — ${why}`);
  try {
    const ust: any = await (wallet as any).unshielded?.waitForSyncedState?.();
    const uBalances: Record<string, bigint> = ust?.balances ?? {};
    const nightColor = Object.entries(uBalances).sort((a, b) =>
      a[1] < b[1] ? 1 : -1,
    )[0]?.[0];
    if (!nightColor) throw new Error("no unshielded balance keys visible");
    const unshieldedAddrObj = walletResult.unshieldedKeystore.getBech32Address();
    const uRecipe = await wallet.initSwap(
      { unshielded: { [colors.unshielded]: 1_000n } } as any,
      [
        {
          type: "unshielded",
          outputs: [
            { type: nightColor, amount: 1_000n, receiverAddress: unshieldedAddrObj },
          ],
        } as any,
      ],
      keys,
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    const uFinalized = await wallet.finalizeTransaction(uRecipe.transaction);
    const uBlob = encodeOffer(uFinalized.serialize());
    const uSub = await submitOffer(uBlob);
    if (uSub.status !== 200) {
      skip(
        `validator rejected as expected for current SDK: ${uSub.body?.error} — ${String(uSub.body?.reason ?? "").slice(0, 90)}`,
      );
      return;
    }
    await assert(
      "STRETCH: unshielded-give offer accepted (existence check passed)",
      async () => true,
    );
    const uOfferTx = Transaction.deserialize(
      "signature",
      "proof",
      "binding",
      decodeOffer(uBlob),
    );
    const uBal = await (wallet as any).balanceFinalizedTransaction(uOfferTx, keys, {
      ttl: new Date(Date.now() + 30 * 60_000),
    });
    const uSettle = await wallet.finalizeRecipe(uBal);
    await (wallet as any).submitTransaction(uSettle);
    await assert(
      "STRETCH: spent_unshielded grew on settle (UnshieldedSpend primitive live)",
      async () =>
        waitFor(
          "spent_unshielded > before",
          async () => (await count(db, "spent_unshielded")) > spentUnshieldedBefore,
          30,
        ),
    );
  } catch (e) {
    skip(String(e).slice(0, 140));
  }
}
