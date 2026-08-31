// Funding bootstrap for the multi-product stack.
//
// Genesis is touched ONCE per wallet, at the start. For each product's fee
// wallet, in order:
//   1. seed NIGHT UTXO
//   2. register the night ADDRESS for dust generation
//      (address-level: every UTXO received AFTER this generates its own dust
//       stream — registering later would consolidate existing UTXOs into ≤2
//       and destroy the fee lanes)
//   3. one large transfer
//   4. ONE self-split transaction into `lanes` large UTXOs = `lanes` parallel
//      fee lanes (an incremental loop does not converge — coin selection
//      happily consumes k small coins to recreate k outputs)
//   5. wait for `lanes` SPENDABLE dust coins (count AND per-coin value)
// Actor wallets (product-b/c workloads) get shielded coins to transfer.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ACTOR_SEEDS, FUNDING, GENESIS_SEED, NETWORK } from "../shared/env.ts";
import {
  buildWallet,
  getDustCoins,
  getShieldedBalance,
  getUnshieldedBalance,
  getUnshieldedCoinCount,
  ignoreCleanWebSocketClose,
  registerForDust,
  transferShielded,
  transferUnshielded,
  type WalletCtx,
  waitForDustCoins,
  waitForSelectableDust,
  waitForSelfTransferSettled,
  waitForUnshieldedBalanceAtLeast,
  waitSynced,
} from "../shared/wallet.ts";
import { assertRegistryIsSane, buildProducts } from "./registry.ts";

const READY_FILE = path.join(import.meta.dirname!, "../batcher-data/funding-ready.json");
/** A dust coin must cover the wallet's 0.3 DUST fee margin plus headroom. */
const MIN_DUST_PER_COIN = 500_000_000_000_000n;

async function fundProductWallet(
  genesis: WalletCtx,
  seed: string,
  label: string,
  lanes: number,
): Promise<{ lanes: number; dustCoins: number }> {
  console.log(`\n[fund] ══ ${label} ══`);
  const wallet = await buildWallet(NETWORK, seed);
  try {
    let balance = await getUnshieldedBalance(wallet);

    if (balance === 0n) {
      console.log(`[fund] ${label}: seed transfer (${FUNDING.seedStars} stars)...`);
      await transferUnshielded(genesis, [
        { receiver: wallet.unshieldedAddress, amount: FUNDING.seedStars },
      ]);
      balance = await waitForUnshieldedBalanceAtLeast(wallet, FUNDING.seedStars);
    } else {
      console.log(`[fund] ${label}: already holds ${balance} stars`);
    }

    console.log(`[fund] ${label}: registering address for dust...`);
    await registerForDust(wallet);
    await waitForDustCoins(wallet, 1, 1n, 180_000);

    const want = FUNDING.fundStarsPerProduct + FUNDING.seedStars;
    if (balance < FUNDING.fundStarsPerProduct) {
      console.log(`[fund] ${label}: main transfer (${FUNDING.fundStarsPerProduct} stars)...`);
      await transferUnshielded(genesis, [
        { receiver: wallet.unshieldedAddress, amount: FUNDING.fundStarsPerProduct },
      ]);
      balance = await waitForUnshieldedBalanceAtLeast(wallet, want);
    }

    // The main-funding UTXO just landed; its dust coin starts near zero and
    // would be the one coin selection picks. Wait for it to mature.
    await waitForSelectableDust(wallet, MIN_DUST_PER_COIN, 300_000);

    let coins = await getUnshieldedCoinCount(wallet);
    if (coins < lanes) {
      const per = FUNDING.fundStarsPerProduct / BigInt(lanes);
      const full = await getUnshieldedBalance(wallet);
      console.log(`[fund] ${label}: splitting into ${lanes} lanes of ~${per} stars (have ${coins})...`);
      await transferUnshielded(
        wallet,
        Array.from({ length: lanes - 1 }, () => ({
          receiver: wallet.unshieldedAddress,
          amount: per,
        })),
      );
      coins = await waitForSelfTransferSettled(wallet, full);
      if (coins < lanes) {
        throw new Error(`[fund] ${label}: split produced ${coins}/${lanes} lanes`);
      }
    }
    await registerForDust(wallet).catch(() => {});

    console.log(`[fund] ${label}: waiting for ${lanes} spendable dust coins...`);
    const dust = await waitForDustCoins(wallet, lanes, MIN_DUST_PER_COIN, 600_000);
    console.log(`[fund] ${label}: ready — ${coins} lanes, ${dust.spendable}/${dust.count} spendable dust`);
    return { lanes: coins, dustCoins: dust.spendable };
  } finally {
    await wallet.wallet.stop().catch(() => {});
  }
}

async function fundActorWallet(
  genesis: WalletCtx,
  seed: string,
  label: string,
  genesisShielded: bigint,
): Promise<bigint> {
  const actor = await buildWallet(NETWORK, seed);
  try {
    let shielded = await getShieldedBalance(actor);
    const target = BigInt(FUNDING.actorCoins) * FUNDING.actorCoinValue;
    if (shielded >= target) {
      console.log(`[fund] ${label}: already funded (${shielded})`);
      return shielded;
    }
    if (genesisShielded === 0n) {
      console.log(`[fund] WARNING: genesis has no shielded balance — ${label} unfunded`);
      return shielded;
    }
    const addr = await actor.wallet.shielded.getAddress();
    const perBatch = 10;
    for (let sent = 0; sent < FUNDING.actorCoins; sent += perBatch) {
      const n = Math.min(perBatch, FUNDING.actorCoins - sent);
      console.log(`[fund] ${label}: ${n} shielded coins of ${FUNDING.actorCoinValue}...`);
      await transferShielded(
        genesis,
        addr,
        Array.from({ length: n }, () => FUNDING.actorCoinValue),
      );
      const expect = BigInt(sent + n) * FUNDING.actorCoinValue;
      const start = Date.now();
      while ((shielded = await getShieldedBalance(actor)) < expect) {
        if (Date.now() - start > 180_000) {
          throw new Error(`[fund] ${label}: stalled at ${shielded}/${expect}`);
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    console.log(`[fund] ${label}: funded (shielded=${shielded})`);
    return shielded;
  } finally {
    await actor.wallet.stop().catch(() => {});
  }
}

async function main() {
  setNetworkId(NETWORK.id as never);
  const products = buildProducts(NETWORK.id);
  assertRegistryIsSane(products, Object.values(ACTOR_SEEDS));

  console.log(`[fund] network=${NETWORK.id} node=${NETWORK.node}`);
  console.log(
    `[fund] ${products.length} product(s), ${FUNDING.lanesPerProduct} fee lanes each`,
  );

  const genesis = await buildWallet(NETWORK, GENESIS_SEED);
  // Genesis must be SYNCED before it can pay. A wallet that has only just been
  // built reports zero for everything, so reading the balance here without
  // waiting looks exactly like an unfunded chain.
  const balances = await waitSynced(genesis, { label: "genesis", timeoutMs: 300_000 });
  console.log(
    `[fund] genesis: shielded=${balances.shielded} unshielded=${balances.unshielded}`,
  );
  if (balances.unshielded === 0n) {
    throw new Error("[fund] genesis has no unshielded NIGHT — is this a fresh dev node?");
  }
  // On a freshly-started chain genesis holds NIGHT immediately but its dust has
  // not accrued yet — every coin reads 0 for the first minute or so. Fees come
  // from dust, so wait for real spendable value rather than failing inside the
  // first transfer.
  const genesisDust = await waitForDustCoins(genesis, 1, MIN_DUST_PER_COIN, 420_000);
  console.log(
    `[fund] genesis: ${genesisDust.spendable}/${genesisDust.count} spendable dust coin(s)`,
  );

  const summary: Record<string, unknown> = {};
  try {
    // Fee wallets — sequential: each step spends genesis change.
    for (const product of products) {
      summary[product.name] = await fundProductWallet(
        genesis,
        product.walletSeed,
        product.name,
        FUNDING.lanesPerProduct,
      );
    }

    // Actor wallets for the transfer/swap products.
    console.log("\n[fund] ══ actor wallets ══");
    for (const [label, seed] of Object.entries(ACTOR_SEEDS)) {
      summary[`actor:${label}`] = String(
        await fundActorWallet(genesis, seed, label, balances.shielded),
      );
    }
  } finally {
    await genesis.wallet.stop().catch(() => {});
  }

  mkdirSync(path.dirname(READY_FILE), { recursive: true });
  writeFileSync(
    READY_FILE,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        network: NETWORK.id,
        lanesPerProduct: FUNDING.lanesPerProduct,
        summary,
      },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
  console.log(`\n[fund] DONE — marker written to ${READY_FILE}`);
  process.exit(0);
}

ignoreCleanWebSocketClose("fund");

main().catch((e) => {
  console.error("[fund] FAILED:", e);
  process.exit(1);
});
