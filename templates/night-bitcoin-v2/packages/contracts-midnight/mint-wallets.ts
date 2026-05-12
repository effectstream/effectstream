import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { faucet } from "./faucet.ts";
import { mintM20ToFillers } from "./mint-m20-to-fillers.ts";
import { registerFillerDust } from "./register-filler-dust.ts";

interface WalletState {
  seed: string;
  shieldedAddress: string;
  unshieldedAddress: string;
}

const NUMBER_OF_WALLETS = 3;
// Initial M20 inventory minted to each filler (in 1e-8 base units).
// 2_500_000 M20 in human terms — enough to cover demo M20→BTC swaps.
const FILLER_M20_INITIAL = 250_000_000_000_000n;

async function loadWallets(): Promise<WalletState[]> {
  const currentDir = process.cwd();
  const wallets: WalletState[] = [];
  for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
    const file = path.join(currentDir, "generated", `wallet-${i}.json`);
    const wallet = JSON.parse(await readFile(file, "utf-8")) as WalletState;
    wallets.push(wallet);
  }
  console.log(`Loaded ${wallets.length} wallets from ${currentDir}/generated`);
  if (!wallets.length) {
    console.error("No wallets found");
    process.exit(1);
  }
  return wallets;
}

export async function mintWallets(): Promise<void> {
  const wallets = await loadWallets();
  const unshieldedTargets = wallets.map((w) => w.unshieldedAddress);
  const fillerSeeds = wallets.map((w) => w.seed);

  // Step 1: Send NIGHTs to filler wallets so they have dust for gas fees.
  await faucet(unshieldedTargets);

  // Step 2: For each filler, register the freshly-received NIGHT UTXO for
  // dust generation. We do this here (with the faucet's process still alive
  // and the chain quiet) instead of in the filler service, because the SDK's
  // `registerNightForDust` waits for `dust.progress.isStrictlyComplete()`,
  // which wedges indefinitely on a wallet rebuilt later in undeployed mode
  // after dust events already exist on chain. On a fresh wallet whose dust
  // subtree is empty, that check passes immediately and the registration
  // tx submits + generates dust before we move on. The filler service then
  // sees `dustBalance > 0` at startup and skips its own (broken) call.
  await registerFillerDust(fillerSeeds);

  // Step 3: Pre-mint M20 inventory to each filler via the new mint_unshielded
  // circuit. Fillers need stock to satisfy BTC→M20 swaps where the demo
  // pretends they're inventory-backed market makers; with the new model the
  // M20 lands in their Lace wallet as native unshielded coins (color = M20).
  await mintM20ToFillers(unshieldedTargets, FILLER_M20_INITIAL);

  console.log("Filler NIGHT + dust registration + M20 pre-mint complete.");
}

if (import.meta.main) {
  await mintWallets();
  process.exit(0);
}
