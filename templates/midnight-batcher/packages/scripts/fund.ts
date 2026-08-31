// Funding bootstrap — the TPS foundation.
//
// Order matters (see TESTING.md background):
//   1. genesis → batcher: ONE seed NIGHT UTXO
//   2. batcher registers its night address for dust generation
//      (address-level on the ledger — every NIGHT UTXO received AFTER this
//       point automatically generates its own dust stream)
//   3. genesis → batcher: one large transfer (FUND_TOTAL_STARS)
//   4. batcher SELF-SPLITS into TARGET_UTXOS large NIGHT UTXOs
//      → TARGET_UTXOS parallel dust streams = parallel fee lanes
//   5. genesis → zswap maker: shielded coins for the zswap workload
//   6. wait until TARGET_UTXOS dust coins are actually SPENDABLE
//      (count + per-coin generated value — not just balance > 0)
//
// The genesis wallet is not touched after step 5.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import { BATCHER_URL, FUNDING, NETWORK, SEEDS } from "./env.ts";
import {
  buildWallet,
  getDustCoins,
  getShieldedBalance,
  getUnshieldedBalance,
  getUnshieldedCoinCount,
  registerForDust,
  transferShielded,
  transferUnshielded,
  waitForDustCoins,
  waitForSelfTransferSettled,
  waitForUnshieldedBalanceAtLeast,
  waitForUnshieldedCoins,
  waitSynced,
  type WalletCtx,
} from "./wallet.ts";

const READY_FILE = path.join(import.meta.dirname!, "../../batcher-data/funding-ready.json");
/** A dust coin must at least cover the wallet's fee overhead margin plus headroom. */
const MIN_DUST_PER_COIN = 500_000_000_000_000n; // 0.5 DUST

async function main() {
  setNetworkId(NETWORK.id as never);
  console.log(`[fund] network=${NETWORK.id} node=${NETWORK.node}`);
  console.log(`[fund] target: ${FUNDING.targetUtxos} UTXOs backed by ${FUNDING.fundTotalStars} stars total`);

  console.log("\n[fund] building genesis wallet...");
  const genesis = await buildWallet(NETWORK, SEEDS.genesis);
  const genesisBalances = await waitSynced(genesis, { label: "genesis" });
  console.log(`[fund] genesis: shielded=${genesisBalances.shielded} unshielded=${genesisBalances.unshielded}`);
  if (genesisBalances.unshielded === 0n) {
    throw new Error("[fund] genesis wallet has no unshielded NIGHT — is this a fresh dev node?");
  }

  console.log("\n[fund] building batcher wallet...");
  const batcher = await buildWallet(NETWORK, SEEDS.batcher);
  await waitSynced(batcher, { label: "batcher" });
  console.log(`[fund] batcher unshielded address: ${batcher.unshieldedAddress}`);

  // ── 1. Seed UTXO (skip if the batcher already holds NIGHT) ──────────────
  let batcherBalance = await getUnshieldedBalance(batcher);
  if (batcherBalance === 0n) {
    console.log(`\n[fund] step 1: genesis → batcher seed transfer (${FUNDING.seedStars} stars)...`);
    await transferUnshielded(genesis, [
      { receiver: batcher.unshieldedAddress, amount: FUNDING.seedStars },
    ]);
    batcherBalance = await waitForUnshieldedBalanceAtLeast(batcher, FUNDING.seedStars);
    console.log(`[fund] batcher received seed UTXO (balance=${batcherBalance})`);
  } else {
    console.log(`\n[fund] step 1: skipped (batcher already holds ${batcherBalance} stars)`);
  }

  // ── 2. Register the batcher address for dust BEFORE the big transfer ────
  console.log("\n[fund] step 2: registering batcher night address for dust...");
  await registerForDust(batcher);
  await waitForDustCoins(batcher, 1, 1n, 180_000);
  console.log("[fund] batcher has its first dust stream");

  // ── 3. Main funding transfer ────────────────────────────────────────────
  const wantTotal = FUNDING.fundTotalStars + FUNDING.seedStars;
  if (batcherBalance < FUNDING.fundTotalStars) {
    console.log(`\n[fund] step 3: genesis → batcher main transfer (${FUNDING.fundTotalStars} stars)...`);
    await transferUnshielded(genesis, [
      { receiver: batcher.unshieldedAddress, amount: FUNDING.fundTotalStars },
    ]);
    batcherBalance = await waitForUnshieldedBalanceAtLeast(batcher, wantTotal);
    console.log(`[fund] batcher funded (balance=${batcherBalance})`);
  } else {
    console.log(`\n[fund] step 3: skipped (balance ${batcherBalance} >= ${FUNDING.fundTotalStars})`);
  }

  // ── 4. Self-split into TARGET_UTXOS large UTXOs ─────────────────────────
  // ONE transfer with (target-1) outputs of `per` each: the total exceeds any
  // subset of previously-created small coins, so coin selection is forced to
  // consume the large coin(s); outputs + change = target coins in one tx.
  // (An incremental loop does NOT converge — selection happily consumes k
  // small coins to recreate k outputs, leaving the count unchanged.)
  const per = FUNDING.fundTotalStars / BigInt(FUNDING.targetUtxos);
  const fullBalance = await getUnshieldedBalance(batcher);
  let coins = await getUnshieldedCoinCount(batcher);
  console.log(`\n[fund] step 4: self-splitting into ${FUNDING.targetUtxos} UTXOs of ~${per} stars (have ${coins})...`);
  if (coins < FUNDING.targetUtxos) {
    const want = FUNDING.targetUtxos - 1;
    console.log(`[fund] split: single tx with ${want} self-outputs of ${per} stars (+change)...`);
    await transferUnshielded(
      batcher,
      Array.from({ length: want }, () => ({
        receiver: batcher.unshieldedAddress,
        amount: per,
      })),
    );
    coins = await waitForSelfTransferSettled(batcher, fullBalance);
    console.log(`[fund] split settled: now ${coins} unshielded coins`);
    if (coins < FUNDING.targetUtxos) {
      throw new Error(`[fund] split produced only ${coins}/${FUNDING.targetUtxos} coins`);
    }
  }
  // Safety: address-level registration should cover the new UTXOs; register
  // any stragglers the wallet still reports as unregistered.
  await registerForDust(batcher).catch(() => {});

  // ── 5. Fund the zswap maker with shielded coins ─────────────────────────
  console.log("\n[fund] step 5: funding zswap maker with shielded coins...");
  const maker = await buildWallet(NETWORK, SEEDS.zswapMaker);
  await waitSynced(maker, { label: "maker" });
  let makerShielded = await getShieldedBalance(maker);
  const makerWant = BigInt(FUNDING.makerCoins) * FUNDING.makerCoinValue;
  if (makerShielded >= makerWant) {
    console.log(`[fund] maker already funded (shielded=${makerShielded})`);
  } else if (genesisBalances.shielded === 0n) {
    console.log("[fund] WARNING: genesis has no shielded balance — zswap workload will be unavailable");
  } else {
    const makerAddr = await maker.wallet.shielded.getAddress();
    const perBatch = 10;
    for (let sent = 0; sent < FUNDING.makerCoins; sent += perBatch) {
      const n = Math.min(perBatch, FUNDING.makerCoins - sent);
      console.log(`[fund] genesis → maker: ${n} shielded coins of ${FUNDING.makerCoinValue}...`);
      await transferShielded(
        genesis,
        makerAddr,
        Array.from({ length: n }, () => FUNDING.makerCoinValue),
      );
      // Each transfer spends genesis change — wait for the maker to see it
      // before the next batch, which also serializes genesis coin usage.
      const target = BigInt(sent + n) * FUNDING.makerCoinValue;
      const start = Date.now();
      while ((makerShielded = await getShieldedBalance(maker)) < target) {
        if (Date.now() - start > 180_000) {
          throw new Error(`[fund] maker funding stalled at ${makerShielded}/${target}`);
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    console.log(`[fund] maker funded (shielded=${makerShielded})`);
  }

  // ── 6. Wait for spendable dust coins ────────────────────────────────────
  console.log(`\n[fund] step 6: waiting for ${FUNDING.targetUtxos} spendable dust coins...`);
  const dust = await waitForDustCoins(
    batcher,
    FUNDING.targetUtxos,
    MIN_DUST_PER_COIN,
    600_000,
  );
  console.log(
    `[fund] dust ready: ${dust.spendable}/${dust.count} spendable coins, balance=${dust.balance}`,
  );

  // ── marker ──────────────────────────────────────────────────────────────
  const finalCoins = await getUnshieldedCoinCount(batcher);
  const dustInfo = await getDustCoins(batcher, MIN_DUST_PER_COIN);
  mkdirSync(path.dirname(READY_FILE), { recursive: true });
  writeFileSync(
    READY_FILE,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        batcherUnshieldedAddress: batcher.unshieldedAddress,
        nightUtxos: finalCoins,
        dustCoins: dustInfo.count,
        spendableDustCoins: dustInfo.spendable,
        dustValues: dustInfo.values.map(String),
        makerShielded: makerShielded.toString(),
        batcherUrl: BATCHER_URL,
      },
      null,
      2,
    ),
  );
  console.log(`\n[fund] DONE — marker written to ${READY_FILE}`);

  await Promise.allSettled([
    genesis.wallet.stop(),
    batcher.wallet.stop(),
    maker.wallet.stop(),
  ]);
  process.exit(0);
}

main().catch((e) => {
  console.error("[fund] FAILED:", e);
  process.exit(1);
});
