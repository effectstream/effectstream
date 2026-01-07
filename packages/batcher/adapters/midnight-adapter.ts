// Midnight blockchain adapter for the EffectStream batcher
// Handles transaction submission to Midnight contracts via circuit invocation

import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";
import type { ContractInfo } from "./midnight-arg-parser.ts";
import { parseCircuitArgs } from "./midnight-arg-parser.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { MidnightBatchBuilderLogic, type MidnightBatchPayload } from "../batch-data-builder/midnight-builder-logic.ts";
import { hexStringToUint8Array } from "@effectstream/utils";
import type {
  BalancedProvingRecipe,
  MidnightProvider,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  CoinPublicKey,
  DustSecretKey,
  EncPublicKey,
  FinalizedTransaction,
  ShieldedCoinInfo,
  TransactionId,
  UnprovenTransaction,
  ZswapSecretKeys,
} from "@midnight-ntwrk/ledger-v6";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  buildWalletFacade,
  getInitialShieldedState,
  syncAndWaitForFunds,
  waitForDustFunds,
  type NetworkUrls as MidnightNetworkUrls,
  type WalletResult,
} from "@effectstream/midnight-contracts/wallet-info";
import type { NetworkId as WalletNetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";

export interface MidnightAdapterConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  zkConfigPath: string;
  privateStateStoreName: string; // LevelDB store name (local)
  privateStateId?: string; // Contract private state ID (on-chain), defaults to privateStateStoreName if not provided
  contractJoinTimeoutSeconds?: number; // Defaults to 120 seconds
  walletFundingTimeoutSeconds?: number; // Defaults to 180 seconds
  walletNetworkId?: WalletNetworkId.NetworkId; // Optional override for modular wallet network id
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

/**
 * Midnight blockchain adapter implementing BlockchainAdapter interface
 * Enables batcher to submit transactions by invoking Compact contract circuits
 */
export class MidnightAdapter implements BlockchainAdapter<MidnightBatchPayload | null> {
  private readonly contractAddress: string;
  private readonly config: MidnightAdapterConfig;
  private readonly contractInfo: ContractInfo;
  private readonly syncProtocolName: string;
  public readonly maxBatchSize?: number;

  // Private helper for building batch data
  private readonly batchBuilderLogic = new MidnightBatchBuilderLogic();

  private walletResult: WalletResult | null = null;
  private walletProvider: (WalletProvider & MidnightProvider) | null = null;
  private deployedContract: any = null;
  private publicDataProvider: any | null = null;
  private hasFunds = false;
  private lastFundingBalances:
    | { shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint }
    | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private walletAddress: string | null = null;
  private contractJoined = false;
  private contractJoiningPromise: Promise<void> | null = null;
  private contractInstance: any = null;
  private witnesses: any = null;
  private readonly contractJoinTimeoutMs: number;
  private readonly walletFundingTimeoutMs: number;
  private readonly walletNetworkId: WalletNetworkId.NetworkId;

  constructor(
    contractAddress: string,
    walletSeed: string,
    config: MidnightAdapterConfig,
    contractInstance: any,
    witnesses: any,
    contractInfo: ContractInfo,
    syncProtocolName: string,
    maxBatchSize: number = 10000,
  ) {
    this.contractAddress = contractAddress;
    this.config = config;
    this.contractInfo = contractInfo;
    this.syncProtocolName = syncProtocolName;
    this.maxBatchSize = maxBatchSize;
    this.contractJoinTimeoutMs = (config.contractJoinTimeoutSeconds ?? 120) * 1000;
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 180) * 1000;
    // Default to lowercase "undeployed" (NetworkId.NetworkId uses lowercase strings)
    this.walletNetworkId = config.walletNetworkId ?? "undeployed";

    // Store contract info for lazy joining
    this.contractInstance = contractInstance;
    this.witnesses = witnesses;

    // Start async initialization but don't await
    this.initializationPromise = this.initialize(walletSeed);
  }

  /**
   * Initialize wallet and providers, wait for funds, and join contract
   * This ensures the adapter is fully ready before accepting transactions
   */
  private async initialize(walletSeed: string): Promise<void> {
    try {
      // Derive compact runtime network name from walletNetworkId (capitalize first letter)
      const compactNetworkId = this.walletNetworkId.charAt(0).toUpperCase() + 
        this.walletNetworkId.slice(1).toLowerCase();
      setNetworkId(compactNetworkId as any);

      console.log("🔗 Building Midnight wallet (modular SDK)...");

      const networkUrls: MidnightNetworkUrls = {
        indexer: this.config.indexer,
        indexerWS: this.config.indexerWS,
        node: this.config.node,
        proofServer: this.config.proofServer,
      };

      // Pass NetworkId enum directly - no normalization needed
      this.walletResult = await buildWalletFacade(
        networkUrls,
        walletSeed,
        this.walletNetworkId,
        { ledgerNetworkCasing: "upper" }, // dust/ledger expect capitalized here
      );

      const initialState = await getInitialShieldedState(
        this.walletResult.wallet.shielded,
      );
      this.walletAddress = initialState.address.coinPublicKeyString();
      console.log("✅ Wallet built and sync started");
      console.log(`📍 Batcher wallet address: ${this.walletAddress}`);
      console.log(`📍 Batcher dust address: ${this.walletResult.dustAddress}`);
      console.log(`🔑 Coin public key: ${initialState.address.coinPublicKeyString()}`);
      console.log(
        `🛡️ Encryption public key: ${initialState.address.encryptionPublicKeyString()}`,
      );

      this.walletProvider = this.createWalletAndMidnightProvider(
        this.walletResult,
      );

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

      // Wait for wallet to be funded and synced before starting batcher
      console.log(
        "💰 Waiting for wallet to be funded and synced before starting batcher...",
      );
      await this.ensureFunds();

      // NOTE: We skip joining the contract during initialization to avoid long startup times
      // The contract will be joined lazily when the first transaction is submitted
      console.log("⚠️ Contract join deferred until first transaction (lazy join)");

      console.log("✅ Midnight adapter fully initialized and ready!");

      this.isInitialized = true;
    } catch (error) {
      console.error("❌ Failed to initialize Midnight adapter:", error);
      throw error;
    }
  }

  /**
   * Join the contract lazily (after wallet is synced and ready)
   * This mirrors what the interact script does
   */
  private async ensureContractJoined(): Promise<void> {
    // If already joined, return immediately
    if (this.contractJoined) {
      return;
    }

    // If already joining, wait for existing join to complete
    if (this.contractJoiningPromise) {
      console.log("⏳ Contract join already in progress, waiting...");
      await this.contractJoiningPromise;
      return;
    }

    // Guard against concurrent join attempts
    if (!this.walletResult || !this.walletProvider) {
      throw new Error("Cannot join contract: wallet not initialized");
    }

    // Start the join process
    this.contractJoiningPromise = (async () => {
      try {
        console.log("⚙️ Configuring providers for contract join...");

        const walletAndMidnightProvider = this.walletProvider!;

        // For the batcher, we use minimal private state config.
        // We provide privateStateStoreName but omit midnightDbName to use in-memory storage.
        // This avoids persisting/syncing historical private state which can take minutes and timeout.
        // The batcher only needs to submit transactions, not read historical private state.
        const providers = {
          privateStateProvider: levelPrivateStateProvider({
            privateStateStoreName: this.config.privateStateStoreName,
            walletProvider: walletAndMidnightProvider,
          } as any),
          publicDataProvider: this.publicDataProvider,
          zkConfigProvider: new NodeZkConfigProvider(this.config.zkConfigPath),
          proofProvider: httpClientProofProvider(this.config.proofServer),
          walletProvider: walletAndMidnightProvider,
          midnightProvider: walletAndMidnightProvider,
        };

        console.log("🔗 Joining contract at address:", this.contractAddress);

        // Check if indexer is responding before attempting to join
        try {
          console.log("🔍 Checking indexer health...");
          const blockQuery = `query { block { height } }`;
          const healthResponse = await fetch(this.config.indexer, {
            method: "POST",
            body: JSON.stringify({ query: blockQuery }),
            headers: { "Content-Type": "application/json" },
          });
          if (!healthResponse.ok) {
            throw new Error(`Indexer returned ${healthResponse.status}`);
          }
          const healthData = await healthResponse.json();
          console.log(`✅ Indexer is responding. Current block: ${healthData.data?.block?.height || "unknown"}`);
        } catch (error) {
          console.error("❌ Indexer health check failed:", error);
          throw new Error(`Cannot join contract: Midnight indexer is not responding at ${this.config.indexer}`);
        }

        // Use privateStateId if provided, otherwise fall back to privateStateStoreName
        const privateStateId = this.config.privateStateId ??
          this.config.privateStateStoreName;
        console.log(`🔑 Using privateStateId: ${privateStateId}`);

        // With minimal private state config, joining should be fast (no historical sync needed)
        // But we still keep a timeout as a safety measure
        const contractJoinTimeoutSeconds = Math.round(this.contractJoinTimeoutMs / 1000);
        console.log(`⏱️ Contract join timeout: ${contractJoinTimeoutSeconds}s`);
        console.log("🔍 Starting findDeployedContract...");
        
        const joinStartTime = Date.now();
        this.deployedContract = await Promise.race([
          (async () => {
            const result = await findDeployedContract(providers, {
              contractAddress: this.contractAddress,
              contract: this.contractInstance,
              privateStateId: privateStateId,
              initialPrivateState: {},
            });
            const joinDuration = Math.round((Date.now() - joinStartTime) / 1000);
            console.log(`✅ findDeployedContract completed in ${joinDuration}s`);
            return result;
          })(),
          new Promise((_, reject) => 
            setTimeout(() => {
              const elapsed = Math.round((Date.now() - joinStartTime) / 1000);
              reject(new Error(
                `Timeout: Contract join operation did not complete within ${contractJoinTimeoutSeconds} seconds ` +
                `(elapsed: ${elapsed}s). This indicates the Midnight indexer/node is not responding properly ` +
                "or there's an issue with private state synchronization even with minimal config."
              ));
            }, this.contractJoinTimeoutMs)
          )
        ]);

        console.log("✅ Contract joined successfully");

        // With empty private state config, no sync is needed - ready immediately
        this.contractJoined = true;
      } catch (error) {
        console.error("❌ Failed to join contract:", error);
        this.contractJoiningPromise = null; // Reset so it can be retried
        throw error;
      }
    })();

    await this.contractJoiningPromise;
  }

  /**
   * Create wallet and midnight provider wrapper
   */
  private createWalletAndMidnightProvider(
    walletResult: WalletResult,
  ): WalletProvider & MidnightProvider {
    const {
      wallet,
      zswapSecretKeys,
      walletZswapSecretKeys,
      dustSecretKey,
      walletDustSecretKey,
    } = walletResult;

    return {
      getCoinPublicKey(): CoinPublicKey {
        return zswapSecretKeys.coinPublicKey;
      },
      getEncryptionPublicKey(): EncPublicKey {
        return zswapSecretKeys.encryptionPublicKey;
      },
      balanceTx(
        tx: UnprovenTransaction,
        _newCoins?: ShieldedCoinInfo[],
        ttl?: Date,
      ): Promise<BalancedProvingRecipe> {
        return wallet.balanceTransaction(
          walletZswapSecretKeys,
          walletDustSecretKey,
          tx,
          ttl ?? createTtl(),
        );
      },
      submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
        return wallet.submitTransaction(tx);
      },
    };
  }

  /**
   * Wait for wallet to be synced and have funds (called lazily on first transaction)
   */
  private async ensureFunds(): Promise<void> {
    if (this.hasFunds || !this.walletResult) {
      // Even if we previously had funds, make sure dust is still available
      if (this.walletResult && (!this.lastFundingBalances || this.lastFundingBalances.dustBalance === 0n)) {
        try {
          const dust = await waitForDustFunds(
            this.walletResult.wallet,
            this.walletFundingTimeoutMs,
          );
          if (this.lastFundingBalances) {
            this.lastFundingBalances.dustBalance = dust;
          } else {
            this.lastFundingBalances = {
              shieldedBalance: 0n,
              unshieldedBalance: 0n,
              dustBalance: dust,
            };
          }
          if (dust > 0n) {
            this.hasFunds = true;
          }
        } catch (_err) {
          // If dust still not available, keep existing state; callTx will log balances
        }
      }
      return;
    }

    console.log("💰 Checking wallet sync and balance with modular SDK...");

    try {
      const balances = await syncAndWaitForFunds(this.walletResult.wallet, {
        timeoutMs: this.walletFundingTimeoutMs,
      });
      // If dust is missing but we have unshielded funds, try to sync dust explicitly
      if (balances.dustBalance === 0n && balances.unshieldedBalance > 0n) {
        try {
          const dust = await waitForDustFunds(
            this.walletResult.wallet,
            this.walletFundingTimeoutMs,
          );
          balances.dustBalance = dust;
        } catch (_err) {
          // keep dustBalance as-is; will be logged on failure
        }
      }
      this.lastFundingBalances = {
        shieldedBalance: balances.shieldedBalance,
        unshieldedBalance: balances.unshieldedBalance,
        // fallback to 0n if older syncAndWaitForFunds doesn't return dustBalance
        dustBalance: balances.dustBalance ?? 0n,
      };
      console.log("✅ Wallet fully synced and funded");
      this.hasFunds = true;
    } catch (error) {
      throw new Error(
        `Failed to ensure wallet funds: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  public buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<MidnightBatchPayload | null> | null {
    const options = {
      maxSize: this.maxBatchSize,
    };
    // Cast is safe because we know our helper returns this type
    return this.batchBuilderLogic.buildBatchData(inputs, options) as BatchBuildingResult<MidnightBatchPayload | null> | null;
  }

  /**
   * Cleanup method to properly release resources
   * Should be called when the adapter is being destroyed/shutdown
   */
  public async cleanup(): Promise<void> {
    console.log("🧹 Cleaning up Midnight adapter resources...");
    
    // Close wallet
    if (this.walletResult?.wallet) {
      try {
        await this.walletResult.wallet.stop();
        console.log("✅ Wallet stopped");
      } catch (error) {
        console.warn("⚠️ Error stopping wallet:", error);
      }
    }
    
    // Note: The deployedContract and privateStateProvider don't have explicit close methods
    // The LevelDB connections are managed per-operation by levelPrivateStateProvider
    // However, we should allow a small delay for any pending async operations
    console.log("⏳ Waiting for pending operations to complete...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("✅ Midnight adapter cleanup complete");
  }

  /**
   * Submit a batch transaction to the Midnight contract
   */
  async submitBatch(
    data: MidnightBatchPayload | null,
    fee?: string | bigint,
  ): Promise<BlockchainHash> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      this.initializationPromise = null;
    }

    if (!this.isInitialized || !this.walletResult) {
      throw new Error("Midnight adapter not initialized");
    }

    // Ensure wallet has funds (lazy check)
    await this.ensureFunds();

    // Join contract AFTER wallet is ready (lazy join)
    await this.ensureContractJoined();

    if (!this.deployedContract) {
      throw new Error("Failed to join contract");
    }

    try {

      if (!data || !data.payloads || data.payloads.length === 0) {
        throw new Error("Batch payload contained no invocations");
      }

      if (data.payloads.length > 1) {
        console.warn(
          `⚠️ Midnight adapter received ${data.payloads.length} invocations in a single batch. ` +
            "Currently only the first invocation will be processed.",
        );
      }

      const { circuit, args } = data.payloads[0];

      // Check if circuit is pure (read-only query) or impure (state-changing transaction)
      const circuitDef = this.contractInfo.circuits.find((c) =>
        c.name === circuit
      );
      if (!circuitDef) {
        throw new Error(
          `Circuit "${circuit}" not found in contract. Available circuits: ${
            this.contractInfo.circuits.map((c) => c.name).join(", ")
          }`,
        );
      }

      console.log(
        `🔄 Invoking circuit "${circuit}" with ${args.length} arguments`,
      );

      const parsedArgs = parseCircuitArgs(
        circuit,
        args,
        this.contractInfo,
      );

      console.log(
        `🔍 Circuit "${circuit}" is ${
          circuitDef.pure ? "PURE (query)" : "IMPURE (transaction)"
        }`,
      );
      console.log("🔄 Parsed arguments:", parsedArgs);

      let result;

      if (circuitDef.pure) {
        // Pure circuit - use call (local query, no transaction)
        console.log("📖 Calling pure circuit (read-only query)...");
        try {
          const queryResult = await this.deployedContract.call[circuit](
            ...parsedArgs,
          );
          console.log("✅ Pure circuit query succeeded! Result:", queryResult);

          // For pure circuits, we return a fake transaction ID with the result encoded
          // Since the batcher expects a hash, we'll return a special format
          return `query:${circuit}:${JSON.stringify(queryResult)}`;
        } catch (callError) {
          console.error("❌ Pure circuit call threw an error:");
          console.error(
            "  Error message:",
            callError instanceof Error ? callError.message : String(callError),
          );
          throw callError;
        }
      } else {
        // Impure circuit - use callTx (submit transaction)
        console.log("📝 Calling impure circuit (transaction)...");
        console.log("🔄 deployedContract type:", typeof this.deployedContract);
        console.log("🔄 callTx available?:", !!this.deployedContract?.callTx);
        console.log(
          "🔄 circuit method available?:",
          !!this.deployedContract?.callTx?.[circuit],
        );

        try {
          result = await this.deployedContract.callTx[circuit](
            ...parsedArgs,
          );
        } catch (callTxError) {
          console.error("❌ callTx threw an error:");
          console.error("  Error type:", typeof callTxError);
          console.error(
            "  Error message:",
            callTxError instanceof Error
              ? callTxError.message
              : String(callTxError),
          );
          console.error(
            "  Error stack:",
            callTxError instanceof Error ? callTxError.stack : "N/A",
          );
          if (this.lastFundingBalances) {
            console.error(
              `  Last synced balances -> shielded: ${this.lastFundingBalances.shieldedBalance.toString()}, unshielded: ${this.lastFundingBalances.unshieldedBalance.toString()}, dust: ${this.lastFundingBalances.dustBalance.toString()}`,
            );
          } else {
            console.error("  Last synced balances: unavailable (ensureFunds did not complete)");
          }
          throw callTxError; // Re-throw to be caught by outer catch
        }

        // Check if result has public.txHash (FinalizedTxData) or needs balancing
        if (result && result.public && result.public.txHash) {
          const txHash = result.public.txHash;
          console.log(
            `🚀 Circuit invoked successfully! Transaction Hash: ${txHash}`,
          );
          return txHash;
        } else {
          // Maybe it's an UnbalancedTransaction that needs balancing
          console.log(
            "🔄 Result doesn't have public.txHash, might need balancing:",
            result,
          );
          throw new Error(
            "Transaction result format unexpected - may need balancing",
          );
        }
      }
    } catch (error) {
      console.error("❌ Failed to submit batch:", error);
      throw new Error(
        `Failed to submit batch: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Wait for a transaction to be confirmed on the blockchain
   */
  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60000,
  ): Promise<BlockchainTransactionReceipt> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    console.log(`⏳ Waiting for transaction confirmation: ${hash}`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const txInfo = await this.queryTransactionStatus(hash);

        if (txInfo && txInfo.confirmed) {
          console.log(
            `✅ Transaction confirmed! Block: ${txInfo.blockNumber}, Hash: ${hash}`,
          );

          return {
            hash,
            blockNumber: txInfo.blockNumber,
            status: 1, // Success
            _midnightTxInfo: txInfo,
          };
        }
      } catch (error) {
        console.warn(`Failed to query transaction status: ${error}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
  }

  /**
   * Query transaction status from indexer using GraphQL API
   */
  private async queryTransactionStatus(
    txId: string,
  ): Promise<{ confirmed: boolean; blockNumber: bigint } | null> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    try {
      // Normalize hash format - ensure it's lowercase and proper length
      let normalizedHash = txId.toLowerCase().replace(/^0x/, "");

      // Midnight TransactionId is 72 hex chars (288 bits), but GraphQL expects 64 (256 bits)
      // The actual transaction hash appears to be in the last 64 characters
      if (normalizedHash.length > 64) {
        normalizedHash = normalizedHash.slice(-64);
      } else if (normalizedHash.length < 64) {
        normalizedHash = normalizedHash.padStart(64, "0");
      }

      console.log(
        `Querying transaction: original=${txId}, normalized=${normalizedHash}`,
      );

      // Query the indexer for transaction details by hash
      const query = `query ($hash: String!) {
        transactions(offset: { hash: $hash }) {
          applyStage
          block {
            height
          }
        }
      }`;

      const response = await this.gqlQuery(query, { hash: normalizedHash });

      if (
        !response || !response.transactions ||
        response.transactions.length === 0
      ) {
        // Transaction not found yet
        return null;
      }

      const tx = response.transactions[0];

      if (!tx.block || !tx.applyStage) {
        // Transaction exists but doesn't have complete data yet
        return null;
      }

      // Transaction is confirmed if applyStage is SucceedEntirely
      const applyStage = tx.applyStage;
      const confirmed = applyStage === "SucceedEntirely";

      return {
        confirmed,
        blockNumber: BigInt(tx.block.height),
      };
    } catch (error) {
      console.warn(`Failed to query transaction ${txId}:`, error);
      return null;
    }
  }

  /**
   * Execute a GraphQL query against the Midnight indexer
   */
  private async gqlQuery(
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    const response = await fetch(this.config.indexer, {
      method: "POST",
      body: JSON.stringify({ query, variables }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GraphQL query failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = await response.json();

    if (body.errors) {
      throw new Error(
        `GraphQL query returned errors: ${JSON.stringify(body.errors)}`,
      );
    }

    if (!body.data) {
      throw new Error("GraphQL query returned no data");
    }

    return body.data;
  }

  /**
   * Get the current account/address for this adapter
   */
  getAccountAddress(): string {
    if (!this.walletResult || !this.walletAddress) {
      throw new Error("Wallet not initialized");
    }
    return this.walletAddress;
  }

  /**
   * Get the current chain name or identifier
   */
  getChainName(): string {
    return `Midnight (${this.walletNetworkId})`;
  }

  /**
   * Estimate the fee for submitting a batch
   */
  estimateBatchFee(data: MidnightBatchPayload | null): bigint {
    // Midnight uses native token for fees
    // For now, return 0 as fees are handled by the wallet
    return 0n;
  }

  /**
   * Check if the adapter is ready to submit transactions
   */
  isReady(): boolean {
    return this.isInitialized && this.walletResult !== null;
  }

  /**
   * Get the block number of the latest confirmed block
   */
  async getBlockNumber(): Promise<bigint> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    try {
      // Query latest block from indexer using GraphQL
      const query = `query {
        block {
          height
        }
      }`;

      const response = await this.gqlQuery(query);

      if (!response || !response.block || response.block.height === undefined) {
        throw new Error("Failed to get block from indexer");
      }

      return BigInt(response.block.height);
    } catch (error) {
      throw new Error(
        `Failed to get block number: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get the sync protocol name for this adapter
   */
  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  private parseBatchPayload(
    data: string,
  ): Array<{ circuit: string; args: any[] }> {
    const decoded = this.decodeHexString(data);
    let payload: unknown;
    try {
      payload = JSON.parse(decoded);
    } catch (error) {
      throw new Error(
        `Failed to parse Midnight batch payload JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid Midnight batch payload structure");
    }

    const { prefix, payloads } = payload as {
      prefix: unknown;
      payloads: Array<{
        circuit: unknown;
        args: unknown;
        addressType?: unknown;
        address?: unknown;
        signature?: unknown;
        timestamp?: unknown;
      }>;
    };

    if (prefix !== "&B") {
      throw new Error(`Invalid batch prefix: expected "&B", got "${prefix}"`);
    }

    if (!Array.isArray(payloads)) {
      throw new Error(
        "Invalid Midnight batch payload structure: missing payloads array",
      );
    }

    const sanitized = payloads.map((entry, index) => {
      if (!entry || typeof entry.circuit !== "string") {
        throw new Error(`Invalid circuit name at index ${index}`);
      }

      if (!Array.isArray(entry.args)) {
        throw new Error(`Invalid circuit args at index ${index}`);
      }

      return { circuit: entry.circuit, args: entry.args };
    });

    return sanitized;
  }

  private decodeHexString(hex: string): string {
    const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
    try {
      return new TextDecoder().decode(hexStringToUint8Array(normalized));
    } catch (error) {
      throw new Error(
        `Failed to decode Midnight batch payload hex: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  public verifySignature(input: DefaultBatcherInput): boolean {
    // Midnight inputs are not signed in a way the core batcher understands.
    // The adapter is responsible for this logic (e.g., inside the circuit).
    // We return true to bypass this check, matching the previous hardcoded behavior.
    return true;
  }

  public validateInput(
    input: DefaultBatcherInput,
  ): ValidationResult {
    try {
      // 1. Decode the raw input
      const decodedInput = this.decodeHexIfNeeded(input.input);

      // 2. Shallow Parse (from MidnightBatchDataBuilder)
      let parsed: any;
      try {
        parsed = JSON.parse(decodedInput);
      } catch (error) {
        return {
          valid: false,
          error: "Input is not valid JSON",
        };
      }

      if (
        !parsed || typeof parsed !== "object" ||
        typeof parsed.circuit !== "string" || !Array.isArray(parsed.args)
      ) {
        return {
          valid: false,
          error:
            "Invalid input structure. Expected { circuit: string, args: [] }",
        };
      }

      // 3. Deep Parse (from submitBatch)
      const circuitDef = this.contractInfo.circuits.find((c) =>
        c.name === parsed.circuit
      );
      if (!circuitDef) {
        return {
          valid: false,
          error: `Circuit "${parsed.circuit}" not found. Available: ${
            this.contractInfo.circuits.map((c) => c.name).join(", ")
          }`,
        };
      }

      // 4. Validate arguments
      // parseCircuitArgs will throw if validation fails
      parseCircuitArgs(
        parsed.circuit,
        parsed.args,
        this.contractInfo,
      );

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error
          ? error.message
          : "Unknown validation error",
      };
    }
  }

  private decodeHexIfNeeded(value: string): string {
    if (/^0x[0-9a-fA-F]+$/.test(value)) {
      return new TextDecoder().decode(hexStringToUint8Array(value.slice(2)));
    }
    // Also handle hex without 0x prefix, if needed
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      try {
        return new TextDecoder().decode(hexStringToUint8Array(value));
      } catch {
        // Fallback to original value if not valid hex
      }
    }
    return value;
  }
}
