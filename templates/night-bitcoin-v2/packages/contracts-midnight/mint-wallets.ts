import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { faucet } from "./faucet.ts";
import { joinAndMint } from "./faucet-unshielded-erc20.ts";

interface WalletState {
  seed: string;
  shieldedAddress: string;
  unshieldedAddress: string;
}

const NUMBER_OF_WALLETS = 3;
const ERC20_MINT_AMOUNT = 250000000000000n;

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
  const shieldedTargets = wallets.map((w) => w.shieldedAddress);
  const unshieldedTargets = wallets.map((w) => w.unshieldedAddress);

  // ERC20 minting uses shielded address (contract extracts coinPublicKey)
  await joinAndMint(shieldedTargets, ERC20_MINT_AMOUNT);
  // NIGHT token transfer uses unshielded address (bech32m format)
  await faucet(unshieldedTargets);

  console.log("Minting and NIGHT transfers completed.");
}

if (import.meta.main) {
  await mintWallets();
  process.exit(0);
}
