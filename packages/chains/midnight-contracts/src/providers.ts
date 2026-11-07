// ============================================================================
// Provider Configuration
// ============================================================================

import { Buffer } from "node:buffer";
import * as path from "node:path";
import type { ZswapSecretKeys, DustSecretKey } from "@midnightntwrk/ledger-v9";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  NodeZkConfigProvider,
  nodeZkConfigRegistry,
} from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  createMidnightProviderFromHandlers,
  createWalletProviderFromHandlers,
  type MidnightProvider,
  type MidnightProviders,
  type NetworkId,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import type { NetworkUrls } from "./types.ts";
import type { UnshieldedKeystore } from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { CONSTANTS } from "./constants.ts";
import { getEnv } from "@effectstream/utils/runtime";
import { adoptInWallet, finalizedFromWallet } from "./wallet-transaction.ts";

/**
 * Create a TTL date for transactions
 */
function createTtl(): Date {
  return new Date(Date.now() + CONSTANTS.TTL_DURATION_MS);
}

/**
 * Wallet and midnight providers backed by a wallet-sdk 2 `WalletFacade`.
 *
 * Ledger-v9 only: the v8 entries are `undefined`, so a v8 handle is refused by
 * the providers with `ProviderEraUnsupportedError`. The facade balances with
 * the key material it was started from, so no secret keys are passed here.
 */
function createWalletAndMidnightProviders(
  wallet: WalletFacade,
  zswapSecretKeys: ZswapSecretKeys,
  unshieldedKeystore: UnshieldedKeystore,
): { walletProvider: WalletProvider; midnightProvider: MidnightProvider } {
  const walletProvider = createWalletProviderFromHandlers({
    v8: undefined,
    v9: async (tx, ttl) => {
      const recipe = await wallet.balanceUnboundTransaction(
        await adoptInWallet(wallet, "Unbound", tx),
        { ttl: ttl ?? createTtl() },
      );
      const signedRecipe = await wallet.signRecipe(
        recipe,
        (payload) => unshieldedKeystore.signDataAsync(payload),
      );
      return finalizedFromWallet(wallet, await wallet.finalizeRecipe(signedRecipe));
    },
    getCoinPublicKey: () => zswapSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => zswapSecretKeys.encryptionPublicKey,
  });
  const midnightProvider = createMidnightProviderFromHandlers({
    v8: undefined,
    v9: async (tx) =>
      wallet.submitTransaction(await adoptInWallet(wallet, "Finalized", tx)),
  });
  return { walletProvider, midnightProvider };
}

/**
 * Configure all providers needed for contract deployment and circuit calls.
 *
 * `walletZswapSecretKeys`, `dustSecretKey` and `walletDustSecretKey` are not
 * read: wallet-sdk 2 balances with the keys the facade was started from.
 * `networkId` becomes `providers.config.networkId`, the network every
 * transaction built with these providers targets.
 */
export async function configureMidnightNodeProviders(
  wallet: WalletFacade,
  zswapSecretKeys: ZswapSecretKeys,
  _walletZswapSecretKeys: ZswapSecretKeys,
  _dustSecretKey: DustSecretKey,
  _walletDustSecretKey: DustSecretKey,
  networkUrls: Required<Omit<NetworkUrls, "id">>,
  privateStateStoreName: string,
  zkConfigPath: string,
  unshieldedKeystore: UnshieldedKeystore,
  networkId: NetworkId,
): Promise<MidnightProviders> {
  const signingKeyStoreName = `${privateStateStoreName}-signing-keys`;
  const { walletProvider, midnightProvider } = createWalletAndMidnightProviders(
    wallet,
    zswapSecretKeys,
    unshieldedKeystore,
  );
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath, {
    verify: "require",
  });
  // Midnight.js 5 resolves proof artifacts through a registry so transactions
  // with cross-contract calls can select bundles by verifier key. Search from
  // the managed-artifact parent to include sibling compiled contracts.
  const zkConfigRegistry = await nodeZkConfigRegistry(path.dirname(zkConfigPath));
  return {
    // For deployment, we use full private state config because we may need to verify
    // the deployed contract state. For batcher/transaction submission use cases,
    // a minimal config with just walletProvider is sufficient and much faster:
    //   levelPrivateStateProvider({ walletProvider })
    // Omitting privateStateStoreName/midnightDbName avoids historical private state sync.
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: "midnight-level-db-deploy", // Use separate DB for deployment to avoid lock conflicts
      privateStateStoreName,
      signingKeyStoreName,
      privateStoragePasswordProvider: async () => getEnv("MIDNIGHT_STORAGE_PASSWORD") ?? "YourPasswordMy1!",
      accountId: Buffer.from(zswapSecretKeys.coinPublicKey).toString("hex"),
    }),
    publicDataProvider: indexerPublicDataProvider(
      networkUrls.indexer,
      networkUrls.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(
      networkUrls.proofServer,
      zkConfigRegistry,
    ),
    walletProvider,
    midnightProvider,
    config: {
      networkId,
      ttlSeconds: CONSTANTS.TTL_DURATION_MS / 1000,
    },
  };
}
