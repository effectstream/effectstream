// ============================================================================
// Provider Configuration
// ============================================================================

import { Buffer } from "node:buffer";
import * as path from "node:path";
import type { ZswapSecretKeys, DustSecretKey, CoinPublicKey, EncPublicKey, FinalizedTransaction, TransactionId } from "@midnightntwrk/ledger-v9";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  NodeZkConfigProvider,
  nodeZkConfigRegistry,
} from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type { WalletProvider, MidnightProvider, MidnightProviders, UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import type { NetworkUrls } from "./types.ts";
import type { UnshieldedKeystore } from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { CONSTANTS } from "./constants.ts";
// import { Contract } from "@midnight-ntwrk/compact-js";
import { getEnv } from "@effectstream/utils/runtime";

/**
 * Create a TTL date for transactions
 */
function createTtl(): Date {
    return new Date(Date.now() + CONSTANTS.TTL_DURATION_MS);
  }

/**
 * Create wallet and midnight provider adapter for WalletFacade
 *
 * Implements the WalletProvider and MidnightProvider interfaces
 * as defined in @midnight-ntwrk/midnight-js-types v5.
 */
function createWalletAndMidnightProvider(
    wallet: WalletFacade,
    zswapSecretKeys: ZswapSecretKeys,
    walletZswapSecretKeys: ZswapSecretKeys,
    dustSecretKey: DustSecretKey,
    walletDustSecretKey: DustSecretKey,
    unshieldedKeystore: UnshieldedKeystore
  ): WalletProvider & MidnightProvider {
    return {
      getCoinPublicKey(): CoinPublicKey {
        console.log("✅ Getting coin public key", zswapSecretKeys.coinPublicKey);
        return zswapSecretKeys.coinPublicKey;
      },
      getEncryptionPublicKey(): EncPublicKey {
        console.log("✅ Getting encryption public key", zswapSecretKeys.encryptionPublicKey);
        return zswapSecretKeys.encryptionPublicKey;
      },
      async balanceTx(
        tx: UnboundTransaction,
        ttl?: Date
      ): Promise<FinalizedTransaction> {
        console.log("✅ Balancing transaction", tx);
        const unboundTransactionRecipe = await wallet.balanceUnboundTransaction(tx, {
          shieldedSecretKeys: zswapSecretKeys, 
          dustSecretKey: dustSecretKey,
         }, { ttl: ttl ?? createTtl() } );
        const signedRecipe = await wallet.signRecipe(
          unboundTransactionRecipe,
          (payload) => unshieldedKeystore.signDataAsync(payload),
        );
        return wallet.finalizeRecipe(signedRecipe);
      },
      submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
        console.log("✅ Submitting transaction", tx);
        return wallet.submitTransaction(tx);
      },
    };
  }
  
  /**
   * Configure all providers needed for contract deployment
   */
  export async function configureMidnightNodeProviders(
    wallet: WalletFacade,
    zswapSecretKeys: ZswapSecretKeys,
    walletZswapSecretKeys: ZswapSecretKeys,
    dustSecretKey: DustSecretKey,
    walletDustSecretKey: DustSecretKey,
    networkUrls: Required<Omit<NetworkUrls, "id">>,
    privateStateStoreName: string,
    zkConfigPath: string,
    unshieldedKeystore: UnshieldedKeystore
  ): Promise<MidnightProviders> {
    const signingKeyStoreName = `${privateStateStoreName}-signing-keys`;
    const walletAndMidnightProvider = createWalletAndMidnightProvider(
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
      unshieldedKeystore
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
        // walletProvider: walletAndMidnightProvider, // Use wallet's encryption key for private state
        privateStoragePasswordProvider: async () => getEnv("MIDNIGHT_STORAGE_PASSWORD") ?? "YourPasswordMy1!",
        accountId: Buffer.from(zswapSecretKeys.coinPublicKey).toString('hex'),
      }), // Type assertion: runtime supports walletProvider even though types don't reflect it yet
      publicDataProvider: indexerPublicDataProvider(
        networkUrls.indexer,
        networkUrls.indexerWS
      ),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(
        networkUrls.proofServer,
        zkConfigRegistry,
      ),
      walletProvider: walletAndMidnightProvider,
      midnightProvider: walletAndMidnightProvider,
    };
  }
