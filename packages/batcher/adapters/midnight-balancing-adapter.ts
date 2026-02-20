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
import type {
  ProofProvider,
  PublicDataProvider,
  UnboundTransaction,
  ZKConfigProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { Buffer } from "node:buffer";
import { getInitialDustState } from "@effectstream/midnight-contracts/wallet-info";
import { WalletResult } from "@effectstream/midnight-contracts/types";

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

type DelegatedTxStage = "unproven" | "unbound" | "finalized";
type DelegatedTx = UnprovenTransaction | UnboundTransaction | FinalizedTransaction;
type DelegatedBatchData = {
  tx: DelegatedTx;
  txStage: DelegatedTxStage;
};
type FacadeBalancingRecipe = {
  type: "UNPROVEN_TRANSACTION";
  transaction: UnprovenTransaction;
} | {
  type: "UNBOUND_TRANSACTION";
  baseTransaction: UnboundTransaction;
  balancingTransaction?: UnprovenTransaction;
} | {
  type: "FINALIZED_TRANSACTION";
  originalTransaction: FinalizedTransaction;
  balancingTransaction: UnprovenTransaction;
};

/**
 * Midnight Balancing Adapter (Party B)
 * Receives a serialized delegated transaction (hex), balances it with local dust funds,
 * generates proofs, and submits it to the blockchain.
 */
export class MidnightBalancingAdapter implements BlockchainAdapter<DelegatedBatchData> {
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

        const networkUrls: Required<NetworkUrls> = {
          id: this.walletNetworkId,
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
   * Parses delegated input, handling both plain hex strings and JSON format.
   * Returns the cleaned hex string, optional circuitId, and transaction stage.
   */
  private parseHexInput(
    input: string,
  ): { hex: string; circuitId?: string; txStage?: DelegatedTxStage } {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed) as {
        tx?: string;
        circuitId?: string;
        txStage?: DelegatedTxStage;
      };
      if (!parsed.tx) throw new Error("Missing tx field in JSON input");
      if (parsed.circuitId && typeof parsed.circuitId !== "string") {
        throw new Error("circuitId must be a string");
      }
      if (
        parsed.txStage !== undefined &&
        parsed.txStage !== "unproven" &&
        parsed.txStage !== "unbound" &&
        parsed.txStage !== "finalized"
      ) {
        throw new Error("txStage must be 'unproven', 'unbound', or 'finalized'");
      }
      const cleanHex = parsed.tx.startsWith("0x") ? parsed.tx.slice(2) : parsed.tx;
      return {
        hex: cleanHex,
        circuitId: parsed.circuitId,
        txStage: parsed.txStage,
      };
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
  ): BatchBuildingResult<DelegatedBatchData> | null {
    if (inputs.length === 0) return null;
    
    // We only process one transaction at a time for this adapter
    const input = inputs[0];
    
    try {
      const { hex: cleanHex, circuitId, txStage } = this.parseHexInput(input.input);
      this.currentCircuitId = circuitId ?? this.config.circuitId ?? null;
      console.log(
        `🧾 [balancing] Received tx hex length=${cleanHex.length} target=${input.target} stage=${txStage ?? "auto"} circuitId=${this.currentCircuitId ?? "none"}`,
      );
      const bytes = fromHex(cleanHex);

      let delegatedTx: DelegatedTx;
      let delegatedTxStage: DelegatedTxStage;

      if (txStage === "unbound") {
        delegatedTx = LedgerV6Transaction.deserialize(
          "signature" as const,
          "proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnboundTransaction;
        delegatedTxStage = "unbound";
      } else if (txStage === "finalized") {
        delegatedTx = LedgerV6Transaction.deserialize(
          "signature" as const,
          "proof" as const,
          "binding" as const,
          bytes,
        ) as FinalizedTransaction;
        delegatedTxStage = "finalized";
      } else if (txStage === "unproven") {
        delegatedTx = LedgerV6Transaction.deserialize(
          "signature" as const,
          "pre-proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnprovenTransaction;
        delegatedTxStage = "unproven";
      } else {
        // Backward-compatible auto-detection:
        // v7 delegated calls generally send UnboundTransaction from WalletProvider.balanceTx.
        try {
          delegatedTx = LedgerV6Transaction.deserialize(
            "signature" as const,
            "proof" as const,
            "pre-binding" as const,
            bytes,
          ) as UnboundTransaction;
          delegatedTxStage = "unbound";
        } catch {
          delegatedTx = LedgerV6Transaction.deserialize(
            "signature" as const,
            "pre-proof" as const,
            "pre-binding" as const,
            bytes,
          ) as UnprovenTransaction;
          delegatedTxStage = "unproven";
        }
      }

      try {
        const roundTripHex = Buffer.from(delegatedTx.serialize()).toString("hex");
        console.log(
          `🧾 [balancing] Round-trip serialized length=${roundTripHex.length} stage=${delegatedTxStage}`,
        );
      } catch (error) {
        console.warn("⚠️ [balancing] Failed to round-trip serialize tx:", error);
      }

      return {
        selectedInputs: [input],
        data: {
          tx: delegatedTx,
          txStage: delegatedTxStage,
        },
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
    delegatedBatchData: DelegatedBatchData,
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
    const { tx: delegatedTx, txStage } = delegatedBatchData;
    await this.logDustState(
      txStage === "unbound"
        ? "balanceUnboundTransaction"
        : txStage === "finalized"
        ? "balanceFinalizedTransaction"
        : "balanceUnprovenTransaction",
    );

    // Balance and Prove
    // This adds dust inputs/outputs for fees, generates proofs, and computes binding
    let balancedRecipe: /*BalancedProvingRecipe */any;
    try {
      if (txStage === "unbound") {
        balancedRecipe = await this.walletResult.wallet.balanceUnboundTransaction(
          delegatedTx as UnboundTransaction,
          {
            shieldedSecretKeys: this.walletResult.walletZswapSecretKeys,
            dustSecretKey: this.walletResult.walletDustSecretKey,
          },
          { ttl: createTtl() },
        );
      } else if (txStage === "finalized") {
        balancedRecipe = await this.walletResult.wallet.balanceFinalizedTransaction(
          delegatedTx as FinalizedTransaction,
          {
            shieldedSecretKeys: this.walletResult.walletZswapSecretKeys,
            dustSecretKey: this.walletResult.walletDustSecretKey,
          },
          { ttl: createTtl() },
        );
      } else {
        balancedRecipe = await this.walletResult.wallet.balanceUnprovenTransaction(
          delegatedTx as UnprovenTransaction,
          {
            shieldedSecretKeys: this.walletResult.walletZswapSecretKeys,
            dustSecretKey: this.walletResult.walletDustSecretKey,
          },
          { ttl: createTtl() },
        );
      }
    } catch (error) {
      console.error(
        `❌ balance${
          txStage === "unbound"
            ? "Unbound"
            : txStage === "finalized"
            ? "Finalized"
            : "Unproven"
        }Transaction failed in midnight balancing adapter:`,
        error,
      );
      try {
        await this.logDustState(
          txStage === "unbound"
            ? "balanceUnboundTransaction:failed"
            : txStage === "finalized"
            ? "balanceFinalizedTransaction:failed"
            : "balanceUnprovenTransaction:failed",
        );
      } catch (_err) {
        // ignore
      }
      try {
        const serialized = Buffer.from(delegatedTx.serialize()).toString("hex");
        console.error(
          `[balancing] Delegated tx serialized length=${serialized.length} stage=${txStage}`,
        );
      } catch (serError) {
        console.error("⚠️ [balancing] Failed to serialize delegated tx:", serError);
      }
      throw error;
    }

    const signedRecipe = await this.walletResult.wallet.signRecipe(
      balancedRecipe,
      (payload: Uint8Array) => this.walletResult!.unshieldedKeystore.signData(payload),
    );

    console.log("🚀 Finalizing and submitting transaction...");
    const finalizedTx = await this.finalizeWithProver(signedRecipe);
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
    recipe: FacadeBalancingRecipe,
  ): Promise<FinalizedTransaction> {
    const circuitId = this.currentCircuitId ?? this.config.circuitId ?? null;
    if (!this.proofProvider || !this.zkConfigProvider || !circuitId) {
      return await this.walletResult!.wallet.finalizeRecipe(recipe);
    }

    const zkConfig = await this.zkConfigProvider.get(circuitId);

    switch (recipe.type) {
      case "UNPROVEN_TRANSACTION": {
        const proven = await (this.proofProvider as any).proveTx(
          recipe.transaction,
          { zkConfig },
        );
        return proven.bind() as FinalizedTransaction;
      }
      case "UNBOUND_TRANSACTION": {
        if (!recipe.balancingTransaction) {
          return await this.walletResult!.wallet.finalizeRecipe(recipe);
        }
        const proven = await (this.proofProvider as any).proveTx(
          recipe.balancingTransaction,
          { zkConfig },
        );
        const merged = recipe.baseTransaction.merge(proven.bind());
        return merged.bind() as FinalizedTransaction;
      }
      case "FINALIZED_TRANSACTION": {
        const proven = await (this.proofProvider as any).proveTx(
          recipe.balancingTransaction,
          { zkConfig },
        );
        return recipe.originalTransaction.merge(proven.bind()) as FinalizedTransaction;
      }
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

  estimateBatchFee(_data: DelegatedBatchData): bigint {
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
