// Fast funding for the multi-product e2e suite.
//
// Speed matters here (this runs in CI), so genesis pays every wallet in just
// TWO multi-output transfers and each wallet's own work runs in parallel
// (independent wallets, no coin contention).
//
// The ORDER is load-bearing and is the one thing not to "optimize" away:
//   seed UTXO → register the ADDRESS → send the real funds → split into lanes
// Registration rotates (spends + recreates) whatever UTXOs exist at that
// moment. Fund before registering and you lose lane COUNT (rotation
// consolidates into ≤2 outputs); split a PRE-registration UTXO and the lanes
// exist but generate exactly 0 dust forever — a wallet that looks perfectly
// funded and can never pay a fee.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

import { ACTOR_SEEDS, FUNDING, GENESIS_SEED, NETWORK, PRODUCT_SEEDS } from "./env.ts";
import {
  buildWallet,
  ignoreCleanWebSocketClose,
  getShieldedBalance,
  getUnshieldedBalance,
  getUnshieldedCoinCount,
  registerForDust,
  transferShielded,
  transferUnshielded,
  waitForDustCoins,
  waitForSelectableDust,
  waitForSelfTransferSettled,
  waitForUnshieldedBalanceAtLeast,
  waitSynced,
  type WalletCtx,
} from "./wallet.ts";

const MIN_DUST_PER_COIN = 500_000_000_000_000n;

/** Step 1: register the wallet's night ADDRESS for dust, using its seed UTXO. */
async function registerFeeWallet(seed: string, label: string): Promise<void> {
  const wallet = await buildWallet(NETWORK, seed);
  try {
    await waitForUnshieldedBalanceAtLeast(wallet, FUNDING.seedStars, 300_000);
    console.log(`[fund] ${label}: registering address for dust...`);
    await registerForDust(wallet);
    await waitForDustCoins(wallet, 1, 1n, 300_000);
    console.log(`[fund] ${label}: registered`);
  } finally {
    await wallet.wallet.stop().catch(() => {});
  }
}

/** Step 2 (AFTER the main transfer lands): split into fee lanes. */
async function splitFeeLanes(seed: string, label: string): Promise<void> {
  const lanes = FUNDING.lanesPerProduct;
  const want = FUNDING.seedStars + FUNDING.fundStarsPerProduct;

  const wallet = await buildWallet(NETWORK, seed);
  try {
    await waitForUnshieldedBalanceAtLeast(wallet, want, 300_000);
    // Pay the split fee from the seed UTXO's (mature) dust coin.
    await waitForSelectableDust(wallet, MIN_DUST_PER_COIN, 300_000);

    let coins = await getUnshieldedCoinCount(wallet);
    if (coins < lanes) {
      const full = await getUnshieldedBalance(wallet);
      const per = FUNDING.fundStarsPerProduct / BigInt(lanes);
      console.log(`[fund] ${label}: splitting into ${lanes} lanes (~${per} stars each)...`);
      // ONE transfer with lanes-1 outputs: the total exceeds any subset of the
      // small coins, so coin selection must consume the big post-registration
      // UTXO; outputs + change = `lanes` coins in a single transaction.
      await transferUnshielded(
        wallet,
        Array.from({ length: lanes - 1 }, () => ({
          receiver: wallet.unshieldedAddress,
          amount: per,
        })),
      );
      coins = await waitForSelfTransferSettled(wallet, full, 300_000);
    }
    console.log(`[fund] ${label}: ${coins} lane UTXO(s) created`);
  } finally {
    await wallet.wallet.stop().catch(() => {});
  }

  // Re-open the wallet before judging dust readiness.
  //
  // `generatedNow` is a snapshot the dust wallet refreshes when it processes a
  // relevant event — it does NOT tick with the clock. An instance that was
  // already open when a UTXO arrived keeps reporting that coin as 0 for as
  // long as nothing else happens to the wallet, and the SDK's coin selection
  // (smallest coin with value > 0) then refuses to use it. A freshly built
  // wallet re-syncs and computes real values.
  const fresh = await buildWallet(NETWORK, seed);
  try {
    const dust = await waitForDustCoins(fresh, lanes, MIN_DUST_PER_COIN, 420_000);
    console.log(
      `[fund] ${label}: ready — ${dust.spendable}/${dust.count} spendable dust coin(s)`,
    );
  } finally {
    await fresh.wallet.stop().catch(() => {});
  }
}

async function fundActorShielded(genesis: WalletCtx, seed: string, label: string): Promise<void> {
  const actor = await buildWallet(NETWORK, seed);
  try {
    const target = BigInt(FUNDING.actorCoins) * FUNDING.actorCoinValue;
    if (await getShieldedBalance(actor) >= target) return;
    const addr = await actor.wallet.shielded.getAddress();
    console.log(`[fund] ${label}: ${FUNDING.actorCoins} shielded coins...`);
    await transferShielded(
      genesis,
      addr,
      Array.from({ length: FUNDING.actorCoins }, () => FUNDING.actorCoinValue),
    );
    const start = Date.now();
    let balance = 0n;
    while ((balance = await getShieldedBalance(actor)) < target) {
      if (Date.now() - start > 300_000) {
        throw new Error(`[fund] ${label}: stalled at ${balance}/${target}`);
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    console.log(`[fund] ${label}: funded (${balance})`);
  } finally {
    await actor.wallet.stop().catch(() => {});
  }
}

export async function fundEverything(): Promise<void> {
  setNetworkId(NETWORK.id as never);
  const genesis = await buildWallet(NETWORK, GENESIS_SEED);
  try {
    // Genesis must be SYNCED before it can pay: fees come from dust, and an
    // unsynced dust wallet reports no spendable coin ("could not balance
    // dust") even though the chain has funded it.
    const balances = await waitSynced(genesis, { label: "genesis", timeoutMs: 300_000 });
    console.log(
      `[fund] genesis: shielded=${balances.shielded} unshielded=${balances.unshielded}`,
    );
    // On a freshly-started chain genesis holds NIGHT immediately but its dust
    // has not accrued yet — every coin reads exactly 0 for the first minute or
    // so. Fees come from dust, so wait for real spendable value here rather
    // than failing inside the first transfer.
    const genesisDust = await waitForDustCoins(genesis, 1, MIN_DUST_PER_COIN, 420_000);
    console.log(
      `[fund] genesis: ${genesisDust.spendable}/${genesisDust.count} spendable dust coin(s)`,
    );

    // Sequential on purpose: every wallet opens its own indexer websocket, and
    // CI runners are much smaller than the machine the docker stack was proven
    // on. Three at once is where funding fell over there.
    const feeWallets: { label: string; seed: string; address: string }[] = [];
    for (const [label, seed] of Object.entries(PRODUCT_SEEDS)) {
      const w = await buildWallet(NETWORK, seed);
      const address = w.unshieldedAddress;
      await w.wallet.stop().catch(() => {});
      feeWallets.push({ label, seed, address });
    }

    // ORDER IS LOAD-BEARING. Register each address FIRST, with only a small
    // seed UTXO, and send the real funds afterwards: registration rotates
    // (spends + recreates) whatever UTXOs exist at that moment, and lanes
    // split out of a pre-registration UTXO do not generate dust — they sit at
    // exactly 0 forever. Post-registration receipts each get their own dust
    // stream automatically.
    //
    // Two genesis transactions total, and every wallet's own work runs in
    // parallel (independent wallets, no coin contention).
    console.log("[fund] genesis → fee wallets: seed UTXOs (one transfer)...");
    await transferUnshielded(
      genesis,
      feeWallets.map((w) => ({ receiver: w.address, amount: FUNDING.seedStars })),
    );

    console.log("[fund] registering fee-wallet addresses...");
    for (const w of feeWallets) await registerFeeWallet(w.seed, w.label);

    console.log("[fund] genesis → fee wallets: lane funding (one transfer)...");
    await transferUnshielded(
      genesis,
      feeWallets.map((w) => ({
        receiver: w.address,
        amount: FUNDING.fundStarsPerProduct,
      })),
    );

    console.log("[fund] splitting fee lanes...");
    for (const w of feeWallets) await splitFeeLanes(w.seed, w.label);

    // Actor wallets need shielded coins to build transfers/swaps.
    for (const [label, seed] of Object.entries(ACTOR_SEEDS)) {
      await fundActorShielded(genesis, seed, label);
    }
    console.log("[fund] complete");
  } finally {
    await genesis.wallet.stop().catch(() => {});
  }
}

if (import.meta.main) {
  ignoreCleanWebSocketClose("fund");

  fundEverything()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[fund] FAILED:", e);
      process.exit(1);
    });
}
