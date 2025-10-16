// Midnight blockchain adapter for the Paima batcher
// Handles transaction submission to Midnight contracts via circuit invocation

import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
} from "./adapter.ts";
import type { ContractInfo } from "./midnight-arg-parser.ts";
import { parseCircuitArgs } from "./midnight-arg-parser.ts";
import type { NetworkId } from "@midnight-ntwrk/compact-runtime";
import { WalletBuilder } from "@midnight-ntwrk/wallet";
import type { Resource } from "@midnight-ntwrk/wallet";
import type { Wallet } from "@midnight-ntwrk/wallet-api";
import type {
  BalancedTransaction,
  MidnightProvider,
  UnbalancedTransaction,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from "@midnight-ntwrk/ledger";
import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { createBalancedTx } from "@midnight-ntwrk/midnight-js-types";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";
import { hexStringToUint8Array } from "@paima/utils";

export interface MidnightAdapterConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  zkConfigPath: string;
  privateStateStoreName: string;
}

/**
 * Midnight blockchain adapter implementing BlockchainAdapter interface
 * Enables batcher to submit transactions by invoking Compact contract circuits
 */
export class MidnightAdapter implements BlockchainAdapter {
  private readonly contractAddress: string;
  private readonly config: MidnightAdapterConfig;
  private readonly contractInfo: ContractInfo;
  private readonly networkId: NetworkId;
  private readonly syncProtocolName: string;
  public readonly maxBatchSize?: number;

  private wallet: (Wallet & Resource) | null = null;
  private deployedContract: any = null;
  private publicDataProvider: any | null = null;
  private hasFunds = false;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private walletAddress: string | null = null;

  constructor(
    contractAddress: string,
    walletSeed: string,
    config: MidnightAdapterConfig,
    contractInstance: any,
    witnesses: any,
    contractInfo: ContractInfo,
    networkId: NetworkId,
    syncProtocolName: string,
    maxBatchSize?: number,
  ) {
    this.contractAddress = contractAddress;
    this.config = config;
    this.contractInfo = contractInfo;
    this.networkId = networkId;
    this.syncProtocolName = syncProtocolName;
    this.maxBatchSize = maxBatchSize;

    // Start async initialization but don't await
    this.initializationPromise = this.initialize(
      walletSeed,
      contractInstance,
      witnesses,
    );
  }

  /**
   * Initialize wallet, providers, and contract
   */
  private async initialize(
    walletSeed: string,
    contractInstance: any,
    witnesses: any,
  ): Promise<void> {
    try {
      console.log("🔗 Building Midnight wallet...");

      this.wallet = await WalletBuilder.build(
        this.config.indexer,
        this.config.indexerWS,
        this.config.proofServer,
        this.config.node,
        walletSeed,
        getZswapNetworkId(),
        "info",
      );

      this.wallet.start();

      console.log("✅ Wallet built and sync started");

      // Configure providers
      const walletAndMidnightProvider = await this
        .createWalletAndMidnightProvider(
          this.wallet,
        );

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

      const providers = {
        privateStateProvider: levelPrivateStateProvider({
          privateStateStoreName: this.config.privateStateStoreName,
        }),
        publicDataProvider: this.publicDataProvider,
        zkConfigProvider: new NodeZkConfigProvider(this.config.zkConfigPath),
        proofProvider: httpClientProofProvider(this.config.proofServer),
        walletProvider: walletAndMidnightProvider,
        midnightProvider: walletAndMidnightProvider,
      };

      console.log("⚙️ Providers configured");

      // Join the deployed contract
      console.log(`🔗 Joining contract at address: ${this.contractAddress}`);
      this.deployedContract = await findDeployedContract(providers, {
        contractAddress: this.contractAddress,
        contract: contractInstance,
        privateStateId: this.config.privateStateStoreName,
        initialPrivateState: {},
      });

      console.log("✅ Contract joined successfully");

      this.isInitialized = true;
    } catch (error) {
      console.error("❌ Failed to initialize Midnight adapter:", error);
      throw error;
    }
  }

  /**
   * Create wallet and midnight provider wrapper
   */
  private async createWalletAndMidnightProvider(
    wallet: Wallet,
  ): Promise<WalletProvider & MidnightProvider> {
    const state = await Rx.firstValueFrom(wallet.state());
    this.walletAddress = state.address;
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

  /**
   * Wait for wallet to have funds (called lazily on first transaction)
   */
  private async ensureFunds(): Promise<void> {
    if (this.hasFunds || !this.wallet) {
      return;
    }

    console.log("💰 Checking wallet balance...");

    const state = await Rx.firstValueFrom(this.wallet.state());
    const balance = state.balances[nativeToken()] ?? 0n;

    if (balance > 0n) {
      console.log(`✅ Wallet has balance: ${balance}`);
      this.hasFunds = true;
      return;
    }

    console.log("⏳ Waiting for wallet to receive funds...");

    await Rx.firstValueFrom(
      this.wallet.state().pipe(
        Rx.throttleTime(10_000),
        Rx.tap((state) => {
          const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
          const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
          console.log(
            `Wallet syncing... Backend lag: ${sourceGap}, wallet lag: ${applyGap}`,
          );
        }),
        Rx.filter((state) => state.syncProgress?.synced === true),
        Rx.map((s) => s.balances[nativeToken()] ?? 0n),
        Rx.filter((balance) => balance > 0n),
      ),
    );

    console.log("✅ Wallet funded and ready");
    this.hasFunds = true;
  }

  /**
   * Submit a batch transaction to the Midnight contract
   * @param data - Hex-encoded JSON payload: {"circuit": "...", "args": [...]}
   * @param fee - Fee parameter (not used for Midnight currently)
   */
  async submitBatch(
    data: string,
    fee?: string | bigint,
  ): Promise<BlockchainHash> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      this.initializationPromise = null;
    }

    if (!this.isInitialized || !this.wallet || !this.deployedContract) {
      throw new Error("Midnight adapter not initialized");
    }

    // Ensure wallet has funds (lazy check)
    await this.ensureFunds();

    try {
      // Decode hex data to get JSON payload
      // Strip 0x prefix if present
      const hexData = data.startsWith("0x") ? data.slice(2) : data;
      const jsonStr = new TextDecoder().decode(hexStringToUint8Array(hexData));
      const payload = JSON.parse(jsonStr);

      if (!payload.circuit || !Array.isArray(payload.args)) {
        throw new Error(
          'Invalid payload format: must have "circuit" and "args" fields',
        );
      }

      const circuitName = payload.circuit;
      const argsJson = payload.args;

      console.log(
        `🔄 Invoking circuit "${circuitName}" with ${argsJson.length} arguments`,
      );

      // Parse arguments according to circuit definition
      const parsedArgs = parseCircuitArgs(
        circuitName,
        argsJson,
        this.contractInfo,
      );

      // Invoke circuit
      const result = await this.deployedContract.callTx[circuitName](
        ...parsedArgs,
      );

      const txId = result.public.txId;
      console.log(`🚀 Circuit invoked successfully! Transaction ID: ${txId}`);

      return txId;
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
      // Query the indexer for transaction details by hash
      const query = `query ($hash: String!) {
        transactions(offset: { hash: $hash }) {
          block {
            height
          }
          transactionResult {
            status
          }
        }
      }`;

      const response = await this.gqlQuery(query, { hash: txId });

      if (
        !response || !response.transactions ||
        response.transactions.length === 0
      ) {
        // Transaction not found yet
        return null;
      }

      const tx = response.transactions[0];

      if (!tx.block || !tx.transactionResult) {
        // Transaction exists but doesn't have complete data yet
        return null;
      }

      // Transaction is confirmed if status is SUCCESS or PARTIAL_SUCCESS
      const status = tx.transactionResult.status;
      const confirmed = status === "SUCCESS" || status === "PARTIAL_SUCCESS";

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
    if (!this.wallet || !this.walletAddress) {
      throw new Error("Wallet not initialized");
    }
    return this.walletAddress;
  }

  /**
   * Get the current chain name or identifier
   */
  getChainName(): string {
    return `Midnight (${this.networkId})`;
  }

  /**
   * Estimate the fee for submitting a batch
   */
  estimateBatchFee(data: string): bigint {
    // Midnight uses native token for fees
    // For now, return 0 as fees are handled by the wallet
    return 0n;
  }

  /**
   * Check if the adapter is ready to submit transactions
   */
  isReady(): boolean {
    return this.isInitialized && this.wallet !== null;
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

  /**
   * Cleanup resources (for graceful shutdown)
   */
  cleanup(): void {
    if (this.wallet) {
      console.log("🧹 Closing Midnight wallet...");
      try {
        // Wallet cleanup if needed
        // this.wallet.close();
      } catch (error) {
        console.warn("Warning: Error closing wallet:", error);
      }
    }
  }
}
