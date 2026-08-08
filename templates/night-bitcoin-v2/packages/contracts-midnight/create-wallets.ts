import * as path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import {
  buildWalletFacade,
  getInitialShieldedState,
  midnightNetworkConfig,
} from "@effectstream/midnight-contracts";
import {
  EXPECTED_NIGHT_UTXOS,
  FILLER_WALLETS,
  GENESIS_PROFILE_ID,
  assertUndeployedProfile,
  type FillerWalletId,
} from "./wallet-profile.ts";
import type { GeneratedWalletState } from "./verify-prefunded-wallets.ts";

globalThis.WebSocket = WebSocket;

async function createWallet(
  walletId: FillerWalletId,
  seed: string,
): Promise<GeneratedWalletState> {
  const walletResult = await buildWalletFacade(
    midnightNetworkConfig,
    seed,
    NetworkId.NetworkId.Undeployed,
  );
  try {
    const initialState = await getInitialShieldedState(
      walletResult.wallet.shielded,
    );
    const address = initialState.address as any;
    return {
      seed,
      shieldedAddress:
        address.asString?.() ||
        `${address.coinPublicKeyString()}_${address.encryptionPublicKeyString()}`,
      unshieldedAddress: walletResult.unshieldedAddress,
      genesisProfileId: GENESIS_PROFILE_ID,
      walletId,
      expectedNightUtxos: EXPECTED_NIGHT_UTXOS,
    };
  } finally {
    await walletResult.wallet.stop();
  }
}

export async function createFillerWallets(): Promise<GeneratedWalletState[]> {
  assertUndeployedProfile(String(midnightNetworkConfig.id));
  const wallets = await Promise.all(
    FILLER_WALLETS.map(({ id, seed }) => createWallet(id, seed)),
  );

  const outputDirectory = path.join(process.cwd(), "generated");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    wallets.map((wallet, index) => {
      const outputPath = path.join(outputDirectory, `wallet-${index}.json`);
      return writeFile(
        outputPath,
        `${JSON.stringify(wallet, null, 2)}\n`,
        { mode: 0o600 },
      ).then(() => console.log(`Wallet saved to ${outputPath}`));
    }),
  );
  return wallets;
}

if (import.meta.main) {
  await createFillerWallets();
}
