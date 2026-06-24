// API round-trip swap test folded into the Phase-B runner.
// Mirrors api-roundtrip-swap-e2e.ts but uses the shared DB client and assert()
// from helpers. Infra is already up when this runs (Phase A verified it).
//
// Flow: mint T0/T1 → fund P0/P1 makers → push offers via /api/zswap/submit
//   → wait for Celestia indexing → read back from GET /api/zswaps
//   → reconstruct from API blob → merge + settle via batcher
//   → verify spent_nullifiers + archival + balances
//   → negative: corrupted blob rejected; spent offer re-submit rejected.

import type { Client } from "pg";
import { assert, API_PORT } from "../helpers.ts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { encodeOffer } from "mip-zswap-offer";
import { registerNightForDust } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import { joinOfferFiles, mintShielded } from "../lib/offer-files.ts";
import {
  buildWallet,
  shieldedKeys,
  transferShielded,
  waitForShielded,
  waitForSync,
} from "../lib/wallet.ts";
import {
  describeImbalances,
  mergeFinalized,
  nonDustImbalances,
  settleViaBatcher,
} from "../lib/batcher.ts";
import { getZswaps, reconstructOffer, submitOffer } from "../lib/api.ts";

globalThis.WebSocket = WebSocket;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEP = { T0: 0xa0, T1: 0xa1 } as const;
const MINT_AMOUNT = 1_000_000_000n;
const FUND = 5_000_000n;
const AMT = 1_000n;
const P0_SEED = "0000000000000000000000000000000000000000000000000000000000000030";
const P1_SEED = "0000000000000000000000000000000000000000000000000000000000000031";

export async function apiTest(db: Client): Promise<void> {
  setNetworkId(net.id as any);

  const count = async (t: string): Promise<number> =>
    Number((await db.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n);

  async function waitFor(
    fn: () => Promise<boolean>,
    tries = 36,
    ms = 5000,
  ): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      if (await fn()) return true;
      await sleep(ms);
    }
    return false;
  }

  async function submitAndWaitRoot(blob: string, label: string): Promise<{ status: number; body: any }> {
    let sub = await submitOffer(blob);
    for (let r = 0; r < 24 && sub.status === 400 && sub.body?.error === "ROOT_UNKNOWN"; r++) {
      await sleep(5000);
      sub = await submitOffer(blob);
    }
    await assert(`${label} accepted by submit gate`, async () => sub.status === 200);
    return sub;
  }

  const TAG = "[api-roundtrip]";
  console.log(`${TAG} building genesis + P0 + P1…`);
  const genesis = await buildWallet(net.walletSeed);
  const p0 = await buildWallet(P0_SEED);
  const p1 = await buildWallet(P1_SEED);

  try {
    await waitForSync(genesis, { requireUnshieldedFunds: true });
    try {
      await registerNightForDust(genesis as any);
    } catch (e) {
      console.warn(
        `${TAG} registerNightForDust: ${e instanceof Error ? e.message : String(e)} (continuing)`,
      );
    }
    const p0Addr = await p0.wallet.shielded.getAddress();
    const p1Addr = await p1.wallet.shielded.getAddress();

    // Mint T0, T1; fund P0 with T0, P1 with T1
    console.log(`${TAG} minting T0,T1 + funding makers…`);
    const deployed = await joinOfferFiles(genesis);
    const nonce = BigInt(Date.now());
    const T0 = await mintShielded(deployed, SEP.T0, MINT_AMOUNT, nonce);
    const T1 = await mintShielded(deployed, SEP.T1, MINT_AMOUNT, nonce + 1n);
    for (const [c, l] of [[T0, "T0"], [T1, "T1"]] as const) {
      if ((await waitForShielded(genesis, c, FUND, 24)) < FUND)
        throw new Error(`genesis missing ${l}`);
    }
    await transferShielded(genesis, T0, FUND, p0Addr);
    await transferShielded(genesis, T1, FUND, p1Addr);
    const makersOk =
      (await waitForShielded(p0, T0, AMT, 36)) >= AMT &&
      (await waitForShielded(p1, T1, AMT, 36)) >= AMT;
    await assert("makers funded", async () => makersOk);

    // Build offers: P0 give T0 want T1; P1 give T1 want T0
    const r0 = await p0.wallet.initSwap(
      { shielded: { [T0]: AMT } },
      [
        {
          type: "shielded",
          outputs: [{ type: T1, amount: AMT, receiverAddress: p0Addr }],
        } as any,
      ],
      shieldedKeys(p0),
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    const blob0 = encodeOffer(
      (await p0.wallet.finalizeTransaction(r0.transaction)).serialize(),
    );
    const r1 = await p1.wallet.initSwap(
      { shielded: { [T1]: AMT } },
      [
        {
          type: "shielded",
          outputs: [{ type: T0, amount: AMT, receiverAddress: p1Addr }],
        } as any,
      ],
      shieldedKeys(p1),
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    const blob1 = encodeOffer(
      (await p1.wallet.finalizeTransaction(r1.transaction)).serialize(),
    );

    // Push both offers via API → Celestia → indexed
    const offersBefore = await count("offer_file");
    console.log(`${TAG} pushing 2 offers via /api/zswap/submit…`);
    await submitAndWaitRoot(blob0, "P0 offer (give T0 / want T1)");
    await submitAndWaitRoot(blob1, "P1 offer (give T1 / want T0)");
    const indexedOk = await waitFor(
      async () => (await count("offer_file")) >= offersBefore + 2,
      24,
    );
    await assert("2 offers indexed (reached Celestia + STM)", async () => indexedOk);

    // Read back from API
    console.log(`${TAG} reading available zswaps back from GET /api/zswaps…`);
    const myColors = new Set([T0, T1]);
    const apiOffers = (await getZswaps({ limit: 100 })).filter(
      (o) =>
        o.gives.some((g) => myColors.has(g.token)) ||
        o.wants.some((w) => myColors.has(w.token)),
    );
    await assert("API returned my 2 offers", async () => apiOffers.length === 2);

    const giveColors = new Set(apiOffers.flatMap((o) => o.gives.map((g) => g.token)));
    const wantColors = new Set(apiOffers.flatMap((o) => o.wants.map((w) => w.token)));
    await assert(
      "API gives/wants reflect T0↔T1 swap",
      async () =>
        giveColors.has(T0) &&
        giveColors.has(T1) &&
        wantColors.has(T0) &&
        wantColors.has(T1),
    );

    // Reconstruct each offer tx from the API blob (Celestia round-trip data)
    console.log(`${TAG} reconstructing offers from API transaction_hex…`);
    let reconstructed: ReturnType<typeof reconstructOffer>[];
    try {
      reconstructed = apiOffers.map((o) => reconstructOffer(o.transaction_hex));
      await assert(
        "reconstructed both offers from API blob",
        async () => reconstructed.length === 2,
      );
    } catch (e) {
      await assert("reconstructed both offers from API blob", async () => false);
      return;
    }

    // Merge + settle via batcher
    const merged = mergeFinalized(reconstructed);
    console.log(`${TAG} merged (from API data) imbalances: ${describeImbalances(merged)}`);
    await assert(
      "merged tx from API data is token-balanced",
      async () => nonDustImbalances(merged).length === 0,
    );
    const spentBefore = await count("spent_nullifiers");
    const settle = await settleViaBatcher(merged);
    await assert(
      "batcher settled tx reconstructed from API/Celestia data",
      async () => settle.ok,
    );

    const spentOk = await waitFor(
      async () => (await count("spent_nullifiers")) >= spentBefore + 2,
      36,
    );
    await assert(
      "spent_nullifiers grew by 2 (both offers consumed)",
      async () => spentOk,
    );

    const ids = apiOffers.map((o) => o.id).join(",");
    const archivedOk = await waitFor(
      async () =>
        (await db.query(`SELECT id FROM offer_file WHERE id IN (${ids})`)).rows.length === 0,
      36,
    );
    await assert("both offers archived after settlement", async () => archivedOk);
    await assert("P0 received T1", async () => (await waitForShielded(p0, T1, AMT, 24)) >= AMT);
    await assert("P1 received T0", async () => (await waitForShielded(p1, T0, AMT, 24)) >= AMT);

    // ── NEGATIVE 1: corrupted blob rejected and never reaches Celestia ──
    console.log(`${TAG} NEGATIVE: submitting a corrupted offer blob…`);
    const beforeBad1 = await count("offer_file");
    const corrupted = blob0.slice(0, blob0.length - 12) + "deadbeef0000";
    const badRes1 = await submitOffer(corrupted);
    await assert(
      "corrupted offer rejected at submit (400)",
      async () => badRes1.status === 400,
    );
    await sleep(8000);
    await assert(
      "corrupted offer NEVER reached Celestia (not indexed)",
      async () => (await count("offer_file")) === beforeBad1,
    );

    // ── NEGATIVE 2: re-submit a consumed offer → NULLIFIER_SPENT ──
    console.log(`${TAG} NEGATIVE: re-submitting the already-settled P0 offer…`);
    const beforeBad2 = await count("offer_file");
    const badRes2 = await submitOffer(blob0);
    await assert(
      "spent-offer re-submit rejected (NULLIFIER_SPENT)",
      async () =>
        badRes2.status === 400 && badRes2.body?.error === "NULLIFIER_SPENT",
    );
    await sleep(8000);
    await assert(
      "spent-offer re-submit NEVER reached Celestia (not indexed)",
      async () => (await count("offer_file")) === beforeBad2,
    );
  } finally {
    await p0.wallet.stop().catch(() => {});
    await p1.wallet.stop().catch(() => {});
    await genesis.wallet.stop().catch(() => {});
  }
}
