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
import type {
  PublicDataProvider,
  UnboundTransaction,
} from "@midnight-ntwrk/midnight-js-types";
import type { BalancingRecipe } from "@midnight-ntwrk/wallet-sdk-facade";
import {
  buildWalletFacade,
  getInitialDustState,
  registerNightForDust,
  syncAndWaitForFunds,
  type WalletResult,
  waitForDustFunds,
  type NetworkUrls,
} from "@effectstream/midnight-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { Buffer } from "node:buffer";

export interface MidnightBalancingAdapterConfig {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  walletNetworkId?: WalletNetworkId.NetworkId;
  walletFundingTimeoutSeconds?: number;
  walletResult?: WalletResult | Promise<WalletResult>;
  syncProtocolName?: string;
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

type DelegatedTxStage = "unproven" | "unbound" | "finalized";
type DelegatedTx = UnprovenTransaction | UnboundTransaction | FinalizedTransaction;
type DelegatedTxEntry = {
  tx: DelegatedTx;
  txStage: DelegatedTxStage;
};
// Each batch can contain multiple transactions; they will be balanced speculatively
// (no block confirmation needed between them) using the wallet's pendingDustTokens mechanism.
type DelegatedBatchData = {
  txs: DelegatedTxEntry[];
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
  private syncProtocolName: string;
  // Tracks how many dust UTXOs are currently available (speculatively).
  // Updated before and after each submitBatch so buildBatchData can cap batch
  // size and avoid "No dust tokens" mid-batch failures.
  private cachedDustCount: number = Infinity;

  /** Query dust UTXO count and update cachedDustCount. Safe to call concurrently. */
  private async updateDustCount(): Promise<void> {
    if (!this.walletResult) return;
    try {
      const dustState = await getInitialDustState(this.walletResult.wallet.dust);
      if (typeof dustState.availableCoinsWithFullInfo === "function") {
        const coins = dustState.availableCoinsWithFullInfo(new Date());
        this.cachedDustCount = coins.length;
        console.log(`💰 [balancing] Available dust UTXOs: ${this.cachedDustCount}`);
      }
    } catch (err) {
      console.warn("⚠️ [balancing] Failed to query dust UTXO count:", err);
    }
  }

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

      console.log("✅ Wallet built. Waiting for funds...");
      await this.ensureFunds();
      await this.logDustState("initialize");
      await this.updateDustCount();

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
  ): { hex: string; txStage?: DelegatedTxStage } {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed) as {
        tx?: string;
        txStage?: DelegatedTxStage;
      };
      if (!parsed.tx) throw new Error("Missing tx field in JSON input");
      if (
        parsed.txStage !== undefined &&
        parsed.txStage !== "unproven" &&
        parsed.txStage !== "unbound" &&
        parsed.txStage !== "finalized"
      ) {
        throw new Error("txStage must be 'unproven', 'unbound', or 'finalized'");
      }
      const cleanHex = parsed.tx.startsWith("0x") ? parsed.tx.slice(2) : parsed.tx;
      return { hex: cleanHex, txStage: parsed.txStage };
    }
    const cleanHex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return { hex: cleanHex };
  }

  /**
   * Deserialize one transaction hex into a DelegatedTxEntry.
   */
  private deserializeTxEntry(input: DefaultBatcherInput): DelegatedTxEntry {
    const { hex: cleanHex, txStage } = this.parseHexInput(input.input);
    console.log(
      `🧾 [balancing] Received tx hex length=${cleanHex.length} target=${input.target} stage=${txStage ?? "auto"}`,
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
      // Backward-compatible auto-detection
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

    return { tx: delegatedTx, txStage: delegatedTxStage };
  }

  /**
   * Deserialize all inputs into DelegatedTxEntries for speculative batching.
   * Caps batch size to cachedDustCount so we never attempt more transactions
   * than available dust UTXOs, preventing mid-batch "No dust tokens" failures.
   * Also fires a background dust count refresh so the next call has fresh data.
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions
  ): BatchBuildingResult<DelegatedBatchData> | null {
    // Refresh dust count in the background for the next call.
    this.updateDustCount().catch(() => {});

    if (inputs.length === 0) return null;

    // If we know there are no dust UTXOs available, defer to the next cycle.
    if (this.cachedDustCount === 0) {
      console.log("⏳ [balancing] No dust UTXOs available, deferring batch until next block");
      return null;
    }

    // Cap batch size to available dust UTXOs.
    const maxBatch = this.cachedDustCount === Infinity
      ? inputs.length
      : Math.min(inputs.length, this.cachedDustCount);
    const cappedInputs = inputs.slice(0, maxBatch);
    if (cappedInputs.length < inputs.length) {
      console.log(
        `⚠️ [balancing] Capping batch to ${cappedInputs.length}/${inputs.length} (dust UTXOs: ${this.cachedDustCount})`,
      );
    }

    const txs: DelegatedTxEntry[] = [];
    const selectedInputs: DefaultBatcherInput[] = [];

    for (const input of cappedInputs) {
      try {
        txs.push(this.deserializeTxEntry(input));
        selectedInputs.push(input);
      } catch (error) {
        console.error(`❌ Failed to deserialize transaction for input ${input.target}:`, error);
        // Stop at the first bad input to avoid a gap in accounting
        break;
      }
    }

    if (txs.length === 0) return null;

    console.log(`🧾 [balancing] Built batch of ${txs.length} transaction(s)`);
    return { selectedInputs, data: { txs } };
  }

  /**
   * Balance a single transaction entry against the dust wallet.
   * Each call speculatively marks the consumed UTXOs as pending in the wallet's
   * CoreWallet state (via SubscriptionRef.modifyEffect / spendCoins), so the
   * next call in the same block window automatically picks different UTXOs —
   * no chain confirmation needed between calls.
   */
  private async balanceEntry(entry: DelegatedTxEntry): Promise<any> {
    const { tx: delegatedTx, txStage } = entry;
    await this.logDustState(
      txStage === "unbound"
        ? "balanceUnboundTransaction"
        : txStage === "finalized"
        ? "balanceFinalizedTransaction"
        : "balanceUnprovenTransaction",
    );

    try {
      if (txStage === "unbound") {
        return await this.walletResult!.wallet.balanceUnboundTransaction(
          delegatedTx as UnboundTransaction,
          {
            shieldedSecretKeys: this.walletResult!.walletZswapSecretKeys,
            dustSecretKey: this.walletResult!.walletDustSecretKey,
          },
          { ttl: createTtl() },
        );
      } else if (txStage === "finalized") {
        return await this.walletResult!.wallet.balanceFinalizedTransaction(
          delegatedTx as FinalizedTransaction,
          {
            shieldedSecretKeys: this.walletResult!.walletZswapSecretKeys,
            dustSecretKey: this.walletResult!.walletDustSecretKey,
          },
          { ttl: createTtl() },
        );
      } else {
        return await this.walletResult!.wallet.balanceUnprovenTransaction(
          delegatedTx as UnprovenTransaction,
          {
            shieldedSecretKeys: this.walletResult!.walletZswapSecretKeys,
            dustSecretKey: this.walletResult!.walletDustSecretKey,
          },
          { ttl: createTtl() },
        );
      }
    } catch (error) {
      console.error(
        `❌ balance${txStage === "unbound" ? "Unbound" : txStage === "finalized" ? "Finalized" : "Unproven"}Transaction failed:`,
        error,
      );
      try {
        const serialized = Buffer.from(delegatedTx.serialize()).toString("hex");
        console.error(`[balancing] Delegated tx serialized length=${serialized.length} stage=${txStage}`);
      } catch (_serError) { /* ignore */ }
      throw error;
    }
  }

  async submitBatch(
    batchData: DelegatedBatchData,
    _fee?: string | bigint
  ): Promise<BlockchainHash> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    if (!this.walletResult) {
      throw new Error("Adapter not initialized");
    }

    const { txs } = batchData;
    console.log(`🚀 [balancing] Processing batch of ${txs.length} transaction(s)`);

    // Update dust count before processing so we have an accurate reading
    // before speculative spending begins.
    await this.updateDustCount();

    // Process each transaction individually: balance → prove → submit fire-and-forget.
    // Submitting each tx to the mempool before balancing the next ensures the wallet's
    // pending-transaction state is consistent and avoids gas conflicts that arise when
    // multiple transactions are all balanced against the same ledger state and then
    // submitted together (the second tx's proof can fail pre-dispatch validation once
    // the first tx has mutated shared contract state, e.g. a map's trie structure).
    const hashes: string[] = [];
    try {
      for (let i = 0; i < txs.length; i++) {
        const entry = txs[i];
        const label = `${i + 1}/${txs.length}`;

        console.log(`🧾 [balancing] Balancing tx ${label} (stage=${entry.txStage})`);
        const recipe = await this.balanceEntry(entry);
        const signedRecipe = await this.walletResult.wallet.signRecipe(
          recipe,
          (payload: Uint8Array) => this.walletResult!.unshieldedKeystore.signData(payload),
        );

        console.log(`🔐 [balancing] Finalizing tx ${label}`);
        let finalizedTx: FinalizedTransaction;
        switch (signedRecipe.type) {
          case "FINALIZED_TRANSACTION": {
            const finalizedBalancing = await this.walletResult.wallet.shielded.finalizeTransaction(
              signedRecipe.balancingTransaction,
            );
            finalizedTx = signedRecipe.originalTransaction.merge(finalizedBalancing);
            break;
          }
          case "UNBOUND_TRANSACTION": {
            const boundBase = signedRecipe.baseTransaction.bind();
            if (signedRecipe.balancingTransaction) {
              const finalizedBalancing = await this.walletResult.wallet.shielded.finalizeTransaction(
                signedRecipe.balancingTransaction,
              );
              finalizedTx = boundBase.merge(finalizedBalancing);
            } else {
              finalizedTx = boundBase;
            }
            break;
          }
          case "UNPROVEN_TRANSACTION": {
            finalizedTx = await this.walletResult.wallet.shielded.finalizeTransaction(signedRecipe.transaction);
            break;
          }
        }

        let txHash: string | null = null;
        try {
          const derivedHash = finalizedTx!.transactionHash();
          if (derivedHash) txHash = derivedHash.toString();
        } catch (_error) { /* ignore */ }

        if (txHash !== null) {
          hashes.push(txHash);
          const hash = txHash;
          this.walletResult.wallet.submitTransaction(finalizedTx!)
            .then(() => console.log(`✅ [balancing] Transaction ${label} submitted: ${hash}`))
            .catch((err) => console.error(`❌ [balancing] Transaction ${label} submission failed:`, err));
        } else {
          const txId = await this.walletResult.wallet.submitTransaction(finalizedTx!);
          hashes.push(txId.toString());
          console.log(`✅ [balancing] Transaction ${label} submitted (sync): ${hashes[hashes.length - 1]}`);
        }
      }
    } finally {
      this.updateDustCount().catch(() => {});
    }

    // Return the first hash (batcher framework expects a single receipt hash)
    return hashes[0];
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
