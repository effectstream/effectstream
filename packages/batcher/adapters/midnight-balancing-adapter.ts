// Midnight balancing adapter for the EffectStream batcher
// Handles delegated balancing (Party B) where unproven transactions are received,
// balanced with filler funds, proved, and submitted.

import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  Transaction as LedgerV6Transaction,
  type UnprovenTransaction,
  type FinalizedTransaction,
} from "@midnight-ntwrk/ledger-v7";
import { fromHex } from "@midnight-ntwrk/midnight-js-utils";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import type { ProofProvider, PublicDataProvider, ZKConfigProvider } from "@midnight-ntwrk/midnight-js-types";
import {
  buildWalletFacade,
  getInitialDustState,
  registerNightForDust,
  syncAndWaitForFunds,
  type WalletResult,
  waitForDustFunds,
  type NetworkUrls as MidnightNetworkUrls,
} from "@effectstream/midnight-contracts/wallet-info";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
// import type { BalancedProvingRecipe } from "@midnight-ntwrk/midnight-js-types";
import { Buffer } from "node:buffer";

export interface MidnightBalancingAdapterConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  zkConfigPath?: string;
  circuitId?: string;
  walletNetworkId?: WalletNetworkId.NetworkId;
  walletFundingTimeoutSeconds?: number;
  walletResult?: WalletResult | Promise<WalletResult>;
  syncProtocolName?: string;
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

/**
 * Midnight Balancing Adapter (Party B)
 * Receives a serialized unproven transaction (hex), balances it with local dust funds,
 * generates proofs, and submits it to the blockchain.
 */
export class MidnightBalancingAdapter implements BlockchainAdapter<UnprovenTransaction> {
  private readonly config: MidnightBalancingAdapterConfig;
  private readonly walletNetworkId: WalletNetworkId.NetworkId;
  private readonly walletFundingTimeoutMs: number;

  private walletResult: WalletResult | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private walletAddress: string | null = null;
  private publicDataProvider: PublicDataProvider | null = null;
  private zkConfigProvider: ZKConfigProvider<string> | null = null;
  private proofProvider: ProofProvider | null = null;
  private currentCircuitId: string | null = null;
  private syncProtocolName: string;

  private async logDustState(context: string): Promise<void> {
    if (!this.walletResult) return;
    try {
      const dustState = await getInitialDustState(this.walletResult.wallet.dust);
      const walletBalance = typeof dustState.walletBalance === "function"
        ? dustState.walletBalance(new Date())
        : undefined;
      const balances = dustState.balances && typeof dustState.balances === "object"
        ? Object.values(dustState.balances).reduce(
            (acc: bigint, v: unknown) => acc + BigInt((v as bigint) ?? 0n),
            0n,
          )
        : undefined;
      if (typeof dustState.availableCoinsWithFullInfo === "function") {
        try {
          const fullInfo = dustState.availableCoinsWithFullInfo(new Date());
          console.log(
            `[${context}] Dust availableCoinsWithFullInfo count: ${fullInfo.length}`,
          );
          if (fullInfo.length > 0) {
            console.log(
              `[${context}] Dust full info sample:`,
              fullInfo.slice(0, 2),
            );
          }
        } catch (error) {
          console.warn(
            `⚠️ [${context}] Failed to read availableCoinsWithFullInfo:`,
            error,
          );
        }
      }
    } catch (error) {
      console.warn(`⚠️ [${context}] Failed to read dust wallet state:`, error);
    }
  }

  constructor(
    walletSeed: string,
    config: MidnightBalancingAdapterConfig
  ) {
    this.config = config;
    this.walletNetworkId = config.walletNetworkId ?? ("undeployed" as WalletNetworkId.NetworkId);
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 180) * 1000;
    this.syncProtocolName = config.syncProtocolName ?? `Midnight-Balancing (${this.walletNetworkId})`;

    // Start async initialization
    this.initializationPromise = this.initialize(walletSeed);
  }

  private async initialize(walletSeed: string): Promise<void> {
    try {
      setNetworkId(this.walletNetworkId as any);

      if (this.config.walletResult) {
        console.log("🔗 Using shared Midnight wallet for balancing...");
        this.walletResult = await this.config.walletResult;
      } else {
        console.log("🔗 Building Midnight Balancing Adapter wallet...");

        const networkUrls: MidnightNetworkUrls = {
          indexer: this.config.indexer,
          indexerWS: this.config.indexerWS,
          node: this.config.node,
          proofServer: this.config.proofServer,
        };

        this.walletResult = await buildWalletFacade(
          networkUrls,
          walletSeed,
          this.walletNetworkId
        );
      }

      this.walletAddress = this.walletResult.zswapSecretKeys.coinPublicKey.toString();
      
      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS
      );

    if (this.config.zkConfigPath) {
        this.zkConfigProvider = new NodeZkConfigProvider(this.config.zkConfigPath);
        this.proofProvider = httpClientProofProvider(this.config.proofServer, this.zkConfigProvider);
      } else {
        console.warn(
        "⚠️ Missing zkConfigPath for balancing adapter. Proving may fail.",
        );
      }

      console.log("✅ Wallet built. Waiting for funds...");
      await this.ensureFunds();
      await this.logDustState("initialize");

      this.isInitialized = true;
      console.log("✅ Midnight Balancing Adapter ready!");
    } catch (error) {
      console.error("❌ Failed to initialize Midnight Balancing Adapter:", error);
      throw error;
    }
  }

  private async ensureFunds(): Promise<void> {
    if (!this.walletResult) return;

    try {
      const balances = await syncAndWaitForFunds(this.walletResult.wallet, {
        timeoutMs: this.walletFundingTimeoutMs,
        waitNonZero: false,
      });

      if (balances.dustBalance === 0n && balances.unshieldedBalance > 0n) {
        console.log("🪙 Registering unshielded NIGHT for dust generation...");
        try {
          await registerNightForDust(this.walletResult);
        } catch (error) {
          console.warn("⚠️ Dust registration failed:", error);
        }
      }

      const dustBalance = await waitForDustFunds(
        this.walletResult.wallet,
        { timeoutMs: this.walletFundingTimeoutMs, waitNonZero: true },
      );

      console.log(`💰 Filler Dust Balance: ${dustBalance}`);

      if (dustBalance === 0n) {
        console.warn("⚠️ Warning: Filler wallet has 0 dust balance. Submissions may fail.");
      }
    } catch (error) {
      console.warn("⚠️ Failed to ensure dust funds:", error);
    }
  }

  getAccountAddress(): string {
    return this.walletAddress ?? "unknown";
  }

  getChainName(): string {
    return `Midnight-Balancing (${this.walletNetworkId})`;
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  isReady(): boolean {
    return this.isInitialized && this.walletResult !== null;
  }

  /**
   * Parses hex input, handling both plain hex strings and JSON format.
   * Returns the cleaned hex string and optional circuitId.
   */
  private parseHexInput(input: string): { hex: string; circuitId?: string } {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed) as { tx?: string; circuitId?: string };
      if (!parsed.tx) throw new Error("Missing tx field in JSON input");
      if (parsed.circuitId && typeof parsed.circuitId !== "string") {
        throw new Error("circuitId must be a string");
      }
      const cleanHex = parsed.tx.startsWith("0x") ? parsed.tx.slice(2) : parsed.tx;
      return { hex: cleanHex, circuitId: parsed.circuitId };
    }
    const cleanHex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return { hex: cleanHex };
  }

  /**
   * Deserialize the input hex string into an UnprovenTransaction
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions
  ): BatchBuildingResult<UnprovenTransaction> | null {
    if (inputs.length === 0) return null;
    
    // We only process one transaction at a time for this adapter
    const input = inputs[0];
    
    try {
      const { hex: cleanHex, circuitId } = this.parseHexInput(input.input);
      this.currentCircuitId = circuitId ?? this.config.circuitId ?? null;
      console.log(
        `🧾 [balancing] Received tx hex length=${cleanHex.length} target=${input.target} circuitId=${this.currentCircuitId ?? "none"}`,
      );
      const bytes = fromHex(cleanHex);
      
      // Deserialize as: Signed (by Party A), Pre-Proof, Pre-Binding
      const unprovenTx = LedgerV6Transaction.deserialize(
        'signature' as const,
        'pre-proof' as const,
        'pre-binding' as const,
        bytes
      ) as UnprovenTransaction;

      try {
        const roundTripHex = Buffer.from(unprovenTx.serialize()).toString("hex");
        console.log(
          `🧾 [balancing] Round-trip serialized length=${roundTripHex.length}`,
        );
      } catch (error) {
        console.warn("⚠️ [balancing] Failed to round-trip serialize tx:", error);
      }

      return {
        selectedInputs: [input],
        data: unprovenTx,
      };
    } catch (error) {
      console.error("❌ Failed to deserialize transaction:", error);
      // If we can't deserialize, we can't batch it. 
      // In a real batcher, we might want to mark it as invalid/failed.
      // Returning null means "nothing to batch", which keeps it in the queue indefinitely 
      // unless we handle validation earlier.
      // Ideally validateInput should have caught this.
      return null;
    }
  }

  async submitBatch(
    unprovenTx: UnprovenTransaction,
    _fee?: string | bigint
  ): Promise<BlockchainHash> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    if (!this.walletResult) {
      throw new Error("Adapter not initialized");
    }
    // Ensure dust wallet has synced before attempting to add fees.
    try {
      console.log("🧾 [balancing] waiting for dust sync (pre-balance)...");
      await waitForDustFunds(this.walletResult.wallet, {
        timeoutMs: this.walletFundingTimeoutMs,
        waitNonZero: true,
      });
      console.log("🧾 [balancing] dust sync wait complete");
    } catch (error) {
      console.warn("⚠️ Dust wallet sync wait failed before balancing:", error);
    }
    await this.logDustState("balanceTransaction");

    // Balance and Prove
    // This adds dust inputs/outputs for fees, generates proofs, and computes binding
    let balancedRecipe: /*BalancedProvingRecipe */any;
    try {
      balancedRecipe = await (this.walletResult.wallet as any).balanceTransaction(
        this.walletResult.walletZswapSecretKeys,
        this.walletResult.walletDustSecretKey,
        unprovenTx,
        createTtl()
      );
    } catch (error) {
      console.error("❌ balanceTransaction failed in midnight balancing adapter:", error);
      try {
        await this.logDustState("balanceTransaction:failed");
      } catch (_err) {
        // ignore
      }
      try {
        const serialized = Buffer.from(unprovenTx.serialize()).toString("hex");
        console.error(
          `[balancing] Unproven tx serialized length=${serialized.length}`,
        );
      } catch (serError) {
        console.error("⚠️ [balancing] Failed to serialize unproven tx:", serError);
      }
      throw error;
    }

    console.log("🚀 Finalizing and submitting transaction...");
    const finalizedTx = await this.finalizeWithProver(balancedRecipe);
    const txId = await this.walletResult.wallet.submitTransaction(finalizedTx);

    let txHash = txId.toString();
    try {
      const derivedHash = finalizedTx.transactionHash();
      if (derivedHash) {
        txHash = derivedHash.toString();
      }
    } catch (error) {
      console.warn("⚠️ Failed to derive transaction hash from finalized tx:", error);
    }

    console.log(`✅ Transaction submitted: ${txHash}`);
    return txHash;
  }

  private async finalizeWithProver(
    recipe: /*BalancedProvingRecipe */any,
  ): Promise<FinalizedTransaction> {
    const circuitId = this.currentCircuitId ?? this.config.circuitId ?? null;
    if (!this.proofProvider || !this.zkConfigProvider || !circuitId) {
      return await this.walletResult!.wallet.finalizeTransaction(recipe as any);
    }

    const zkConfig = await this.zkConfigProvider.get(circuitId);

    switch ((recipe as any).type) {
      case "BalanceTransactionToProve": {
        const txToProve = (recipe as any).transactionToProve as UnprovenTransaction;
        const txToBalance = (recipe as any).transactionToBalance as FinalizedTransaction;
        const proven = await (this.proofProvider as any).proveTx(txToProve, { zkConfig });
        return txToBalance.merge(proven.bind()) as FinalizedTransaction;
      }
      case "TransactionToProve": {
        const txToProve = (recipe as any).transaction as UnprovenTransaction;
        const proven = await (this.proofProvider as any).proveTx(txToProve, { zkConfig });
        return proven.bind() as FinalizedTransaction;
      }
      case "NothingToProve":
        return (recipe as any).transaction as FinalizedTransaction;
      default:
        throw new Error(`Unknown proving recipe type: ${(recipe as any).type}`);
    }
  }

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60000
  ): Promise<BlockchainTransactionReceipt> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    const startTime = Date.now();
    // Normalize hash for query
    let normalizedHash = hash.toLowerCase().replace(/^0x/, "");
    // Ensure 64 chars
    if (normalizedHash.length > 64) normalizedHash = normalizedHash.slice(-64);
    else if (normalizedHash.length < 64) normalizedHash = normalizedHash.padStart(64, "0");

    while (Date.now() - startTime < timeout) {
      try {
        const query = `query ($hash: String!) {
          transactions(offset: { hash: $hash }) {
            hash
            block {
              height
            }
          }
        }`;
        
        const response = await fetch(this.config.indexer, {
          method: "POST",
          body: JSON.stringify({ query, variables: { hash: normalizedHash } }),
          headers: { "Content-Type": "application/json" },
        });

        const body = await response.json();
        
        if (body.data?.transactions?.length > 0) {
          const tx = body.data.transactions[0];
          if (tx.block) {
            return {
              hash,
              blockNumber: BigInt(tx.block.height),
              status: 1,
            };
          }
        }
      } catch (err) {
        console.warn("Error querying transaction status:", err);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    
    throw new Error(`Transaction confirmation timeout: ${hash}`);
  }

  estimateBatchFee(_data: UnprovenTransaction): bigint {
    return 0n; // Handled by wallet
  }

  verifySignature(_input: DefaultBatcherInput): boolean {
    return true; // Signature is inside the Midnight transaction and checked by ledger
  }

  validateInput(input: DefaultBatcherInput): ValidationResult {
    try {
      const { hex: cleanHex } = this.parseHexInput(input.input);
      if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
        return { valid: false, error: "Input is not a valid hex string" };
      }
      
      // Optional: try to deserialize here to fail fast
      // const bytes = fromHex(cleanHex);
      // LedgerV6Transaction.deserialize(...) 
      
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  
  async getBlockNumber(): Promise<bigint> {
    // Basic implementation for interface compliance
    const query = `query { block { height } }`;
    const response = await fetch(this.config.indexer, {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: { "Content-Type": "application/json" },
    });
    const body = await response.json();
    return BigInt(body.data?.block?.height ?? 0);
  }
}
