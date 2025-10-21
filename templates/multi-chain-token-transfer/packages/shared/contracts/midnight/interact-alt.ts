/**
 * interact-alt.ts - Alternative interact script that mimics the batcher's behavior
 * 
 * This script tests the hypothesis that the "expected instance of Offer" error
 * is related to long-running processes by:
 * 1. Initializing the wallet early
 * 2. Waiting for sync
 * 3. Keeping the process alive (simulating long-running batcher)
 * 4. Then lazily joining the contract
 * 5. Then submitting the transaction
 * 
 * This mimics the batcher's lifecycle where wallet initialization and
 * contract usage are separated in time.
 */

import {
  type ContractAddress,
  NetworkId,
} from "npm:@midnight-ntwrk/compact-runtime";
import {
  SimpleToken,
  witnesses,
} from "./contract-eip-20/src/index.original.ts";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "npm:@midnight-ntwrk/ledger";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "npm:@midnight-ntwrk/wallet-sdk-address-format";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "npm:@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "npm:@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "npm:@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "npm:@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnbalancedTransaction,
  type WalletProvider,
} from "npm:@midnight-ntwrk/midnight-js-types";
import { type Resource, WalletBuilder } from "npm:@midnight-ntwrk/wallet";
import { type Wallet } from "npm:@midnight-ntwrk/wallet-api";
import { Transaction as ZswapTransaction } from "npm:@midnight-ntwrk/zswap";
import { levelPrivateStateProvider } from "npm:@midnight-ntwrk/midnight-js-level-private-state-provider";
import * as Rx from "npm:rxjs";
import { assertIsContractAddress } from "npm:@midnight-ntwrk/midnight-js-utils";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  setNetworkId,
} from "npm:@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "@std/path";
import { exists } from "@std/fs";

globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type SimpleTokenCircuits = ImpureCircuitId<SimpleToken.Contract>;

const SimpleTokenPrivateStateId = "simpleTokenPrivateState";

type SimpleTokenProviders = MidnightProviders<
  SimpleTokenCircuits,
  typeof SimpleTokenPrivateStateId,
  {}
>;

type SimpleTokenContract = SimpleToken.Contract;

type DeployedSimpleTokenContract =
  | DeployedContract<SimpleTokenContract>
  | FoundContract<SimpleTokenContract>;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId("Undeployed" as unknown as NetworkId);
  }
}

const config = new StandaloneConfig();

const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

const contractConfig = {
  privateStateStoreName: "simpletoken-private-state", // MUST match batcher config!
  zkConfigPath: resolve(
    currentDir,
    "contract-eip-20",
    "src",
    "managed",
    "simpletoken",
  ),
};

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const simpleTokenContractInstance: SimpleTokenContract = new SimpleToken
  .Contract(
  witnesses,
);

/**
 * MidnightAdapter-like class to mimic batcher behavior
 */
class MidnightAdapterMock {
  private wallet: (Wallet & Resource) | null = null;
  private deployedContract: DeployedSimpleTokenContract | null = null;
  private config: Config;
  private contractAddress: string;
  private publicDataProvider: any = null;
  private contractJoined = false;

  constructor(config: Config, contractAddress: string) {
    this.config = config;
    this.contractAddress = contractAddress;
  }

  /**
   * Initialize wallet (like batcher constructor/initialization)
   */
  async initialize(): Promise<void> {
    console.log("🔧 [ADAPTER] Initializing wallet (batcher-style)...");
    
    this.wallet = await WalletBuilder.build(
      this.config.indexer,
      this.config.indexerWS,
      this.config.proofServer,
      this.config.node,
      GENESIS_MINT_WALLET_SEED,
      NetworkId.Undeployed,
    );
    
    this.wallet.start();
    
    // Create public data provider once during initialization
    this.publicDataProvider = indexerPublicDataProvider(
      this.config.indexer,
      this.config.indexerWS,
    );
    
    console.log("✅ [ADAPTER] Wallet initialized and started");
  }

  /**
   * Wait for wallet to be ready (like batcher ensureFunds)
   */
  async ensureFunds(): Promise<void> {
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }

    console.log("⏳ [ADAPTER] Waiting for wallet sync...");
    
    await Rx.firstValueFrom(
      this.wallet.state().pipe(
        Rx.filter((state: any) => {
          const synced = state.syncProgress?.synced === true;
          const balance = state.balances[nativeToken()] ?? 0n;
          console.log(`  Synced: ${synced}, Balance: ${balance}`);
          return synced && balance > 0n;
        }),
      ),
    );

    const state = await Rx.firstValueFrom(this.wallet.state());
    console.log(`✅ [ADAPTER] Wallet ready! Balance: ${state.balances[nativeToken()]}`);
  }

  /**
   * Lazy contract joining (like batcher ensureContractJoined)
   */
  async ensureContractJoined(): Promise<void> {
    if (this.contractJoined || !this.wallet) {
      return;
    }

    console.log("⚙️ [ADAPTER] Configuring providers for contract join...");
    
    const walletAndMidnightProvider = await this.createWalletAndMidnightProvider(
      this.wallet,
    );

    const providers = {
      privateStateProvider: levelPrivateStateProvider<
        typeof SimpleTokenPrivateStateId
      >({
        privateStateStoreName: contractConfig.privateStateStoreName,
      }),
      publicDataProvider: this.publicDataProvider,
      zkConfigProvider: new NodeZkConfigProvider<"mint">(
        contractConfig.zkConfigPath,
      ),
      proofProvider: httpClientProofProvider(this.config.proofServer),
      walletProvider: walletAndMidnightProvider,
      midnightProvider: walletAndMidnightProvider,
    };

    console.log("🔗 [ADAPTER] Joining contract at address:", this.contractAddress);
    
    this.deployedContract = await findDeployedContract(providers, {
      contractAddress: this.contractAddress,
      contract: simpleTokenContractInstance,
      privateStateId: "simpleTokenPrivateState",
      initialPrivateState: {},
    });

    console.log("✅ [ADAPTER] Contract joined successfully");
    this.contractJoined = true;
  }

  /**
   * Submit transaction (like batcher submitBatch)
   */
  async mint(account: string, amount: bigint): Promise<FinalizedTxData> {
    console.log("📤 [ADAPTER] Starting mint transaction...");
    
    await this.ensureFunds();
    await this.ensureContractJoined();

    if (!this.deployedContract) {
      throw new Error("Failed to join contract");
    }

    console.log("🔢 [ADAPTER] Calling mint circuit...");
    
    const shieldedAddress = ShieldedAddress.codec.decode(
      "undeployed",
      MidnightBech32m.parse(account),
    );
    
    const either = {
      is_left: true,
      left: { bytes: shieldedAddress.coinPublicKey.data },
      right: { bytes: new Uint8Array(32) },
    };

    const finalizedTxData = await this.deployedContract.callTx.mint(either, amount);
    
    console.log(
      `✅ [ADAPTER] Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
    );
    
    return finalizedTxData.public;
  }

  private async createWalletAndMidnightProvider(
    wallet: Wallet,
  ): Promise<WalletProvider & MidnightProvider> {
    const state = await Rx.firstValueFrom(wallet.state());
    return {
      coinPublicKey: state.coinPublicKey,
      encryptionPublicKey: state.encryptionPublicKey,
      balanceTx(
        tx: UnbalancedTransaction,
        newCoins: CoinInfo[],
      ): Promise<BalancedTransaction> {
        return wallet
          .balanceTransaction(
            ZswapTransaction.deserialize(
              tx.serialize(getLedgerNetworkId()),
              getZswapNetworkId(),
            ),
            newCoins,
          )
          .then((tx) => wallet.proveTransaction(tx))
          .then((zswapTx) =>
            Transaction.deserialize(
              zswapTx.serialize(getZswapNetworkId()),
              getLedgerNetworkId(),
            )
          )
          .then(createBalancedTx);
      },
      submitTx(tx: BalancedTransaction): Promise<TransactionId> {
        return wallet.submitTransaction(tx);
      },
    };
  }
}

const getContractAddress = async (): Promise<string> => {
  const contractAddressFile = resolve(currentDir, "contract.json");
  
  try {
    if (await exists(contractAddressFile)) {
      const contractAddressFromFile = JSON.parse(
        await Deno.readTextFile(contractAddressFile),
      ).contractAddress;

      if (contractAddressFromFile) {
        console.log(
          `📄 Using contract address from file: ${contractAddressFromFile}`,
        );
        return contractAddressFromFile;
      }
    }
  } catch (error) {
    console.error(`❌ Error reading contract address: ${error}`);
  }
  
  throw new Error("Contract address not found");
};

/**
 * Main function that mimics batcher lifecycle
 */
async function batcherStyleMint(): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 TESTING BATCHER-STYLE LIFECYCLE");
  console.log("=".repeat(80) + "\n");

  const contractAddress = await getContractAddress();
  const config = new StandaloneConfig();

  // Step 1: Initialize adapter (like batcher startup)
  console.log("\n📍 STEP 1: Initialize adapter (like batcher startup)");
  const adapter = new MidnightAdapterMock(config, contractAddress);
  await adapter.initialize();

  // Step 2: Simulate long-running process waiting
  console.log("\n📍 STEP 2: Simulating long-running process (waiting 10 seconds)...");
  console.log("   (This simulates the batcher being idle between initialization and first request)");
  
  for (let i = 10; i > 0; i--) {
    console.log(`   ⏱️  ${i} seconds remaining...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n📍 STEP 3: First transaction request arrives");
  
  // Step 3: Now try to submit a transaction (like first batcher request)
  try {
    const wallet = await WalletBuilder.build(
      config.indexer,
      config.indexerWS,
      config.proofServer,
      config.node,
      GENESIS_MINT_WALLET_SEED,
      NetworkId.Undeployed,
    );
    const address = (await Rx.firstValueFrom(wallet.state())).address;
    
    console.log(`   Target account: ${address}`);
    console.log("   Amount: 20000");
    
    const result = await adapter.mint(address, 20000n);
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ SUCCESS! Transaction completed");
    console.log(`   Transaction ID: ${result.txId}`);
    console.log(`   Block Height: ${result.blockHeight}`);
    console.log("=".repeat(80) + "\n");
    
  } catch (error) {
    console.log("\n" + "=".repeat(80));
    console.log("❌ FAILURE! Transaction failed");
    console.error("   Error:", error);
    
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
    
    console.log("=".repeat(80) + "\n");
    
    throw error;
  }
}

// Run the script
if (import.meta.main) {
  batcherStyleMint().catch((error) => {
    console.error("\n❌ UNHANDLED ERROR:", error);
    Deno.exit(1);
  });
}

export { batcherStyleMint };

