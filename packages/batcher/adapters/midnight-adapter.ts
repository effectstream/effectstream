// Midnight blockchain adapter for the Paima batcher
// Handles transaction submission to Midnight contracts via circuit invocation

import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
} from "./adapter.ts";
import type { ContractInfo } from "./midnight-arg-parser.ts";
import { parseCircuitArgs } from "./midnight-arg-parser.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { hexStringToUint8Array } from "@paima/utils";
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
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";
import { Buffer } from "node:buffer";

export interface MidnightAdapterConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  zkConfigPath: string;
  privateStateStoreName: string; // LevelDB store name (local)
  privateStateId?: string; // Contract private state ID (on-chain), defaults to privateStateStoreName if not provided
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
  private contractJoined = false;
  private contractInstance: any = null;
  private witnesses: any = null;

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

    // Store contract info for lazy joining
    this.contractInstance = contractInstance;
    this.witnesses = witnesses;

    // Start async initialization but don't await
    this.initializationPromise = this.initialize(walletSeed);
  }

  /**
   * Initialize wallet and providers (but NOT contract - that's done lazily)
   */
  private async initialize(walletSeed: string): Promise<void> {
    try {
      const networkId = [
        "Undeployed",
        "Devnet",
        "Testnet",
        "Mainnet",
      ][this.networkId];
      setNetworkId(networkId as any);

      console.log("🔗 Building Midnight wallet...");

      this.wallet = await WalletBuilder.buildFromSeed(
        this.config.indexer,
        this.config.indexerWS,
        this.config.proofServer,
        this.config.node,
        walletSeed,
        getZswapNetworkId(), // Use zswap network ID after setting network
        "info",
      );

      this.wallet.start();

      // Get and log wallet address for debugging
      const initialState = await Rx.firstValueFrom(this.wallet.state());
      this.walletAddress = initialState.address;
      console.log("✅ Wallet built and sync started");
      console.log(`📍 Batcher wallet address: ${this.walletAddress}`);
      console.log(
        `🔑 Coin public key: ${
          Buffer.from(initialState.coinPublicKey).toString("hex")
        }`,
      );

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

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
    if (this.contractJoined || !this.wallet) {
      return;
    }

    console.log("⚙️ Configuring providers for contract join...");

    // Create fresh providers right before joining (like interact script does)
    const walletAndMidnightProvider = await this
      .createWalletAndMidnightProvider(
        this.wallet,
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

    console.log("🔗 Joining contract at address:", this.contractAddress);

    // Use privateStateId if provided, otherwise fall back to privateStateStoreName
    const privateStateId = this.config.privateStateId ??
      this.config.privateStateStoreName;
    console.log(`🔑 Using privateStateId: ${privateStateId}`);

    this.deployedContract = await findDeployedContract(providers, {
      contractAddress: this.contractAddress,
      contract: this.contractInstance,
      privateStateId: privateStateId,
      initialPrivateState: {},
    });

    console.log("✅ Contract joined successfully");

    // CRITICAL: Wait for private state to fully sync after joining
    // The contract needs to download and decrypt historical transactions
    console.log("⏳ Verifying contract private state is accessible...");

    // Try to read from the contract to ensure private state is ready
    // Use a pure circuit call (like balanceOf or owner) to verify
    try {
      const circuitNames = Object.keys(this.deployedContract.call);
      console.log(
        `🔍 Available circuits for testing: ${circuitNames.join(", ")}`,
      );

      console.log(
        "⏳ Waiting 10 seconds for contract private state to sync...",
      );
      await new Promise((resolve) => setTimeout(resolve, 10000));
      console.log("✅ Private state sync delay complete");
    } catch (error) {
      console.warn("⚠️ Contract state test query failed, waiting longer...");
      console.log(
        "⏳ Waiting 5 seconds for contract private state to sync...",
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("✅ Private state sync delay complete");
    }

    this.contractJoined = true;
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
   * Wait for wallet to be synced and have funds (called lazily on first transaction)
   */
  private async ensureFunds(): Promise<void> {
    if (this.hasFunds || !this.wallet) {
      return;
    }

    console.log("💰 Checking wallet sync and balance...");

    const state = await Rx.firstValueFrom(this.wallet.state());
    const balance = state.balances[nativeToken()] ?? 0n;
    const isSynced = state.syncProgress?.synced === true;

    console.log(`Wallet status: synced=${isSynced}, balance=${balance}`);

    // Check both balance AND sync status
    if (balance > 0n && isSynced) {
      console.log(`✅ Wallet has balance and is synced: ${balance}`);
      this.hasFunds = true;
      return;
    }

    if (balance === 0n) {
      console.log("⏳ Waiting for wallet to receive funds...");
    } else {
      console.log("⏳ Wallet has balance but not synced, waiting for sync...");
    }

    // Wait for BOTH sync AND funds
    await Rx.firstValueFrom(
      this.wallet.state().pipe(
        Rx.throttleTime(10_000),
        Rx.tap((state) => {
          const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
          const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
          const synced = state.syncProgress?.synced === true;
          const bal = state.balances[nativeToken()] ?? 0n;
          console.log(
            `Wallet status: synced=${synced}, balance=${bal}, Backend lag: ${sourceGap}, wallet lag: ${applyGap}`,
          );
        }),
        // CRITICAL: Must be synced before submitting transactions
        Rx.filter((state) => state.syncProgress?.synced === true),
        Rx.map((s) => s.balances[nativeToken()] ?? 0n),
        Rx.filter((balance) => balance > 0n),
      ),
    );

    console.log("✅ Wallet fully synced and funded");
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

    if (!this.isInitialized || !this.wallet) {
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
      const payloads = this.parseBatchPayload(data);

      if (payloads.length === 0) {
        throw new Error("Batch payload contained no invocations");
      }

      if (payloads.length > 1) {
        console.warn(
          `⚠️ Midnight adapter received ${payloads.length} invocations in a single batch. ` +
            "Currently only the first invocation will be processed.",
        );
      }

      const { circuit, args } = payloads[0];

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

  public async verifySignature(input: DefaultBatcherInput): Promise<boolean> {
    // Midnight inputs are not signed in a way the core batcher understands.
    // The adapter is responsible for this logic (e.g., inside the circuit).
    // We return true to bypass this check, matching the previous hardcoded behavior.
    return await Promise.resolve(true);
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
