// Midnight balancing adapter for the EffectStream batcher
// Handles delegated balancing (Party B) where unproven transactions are received,
// balanced with filler funds, proved, and submitted.
//
// Architecture: speculative chaining via the wallet SDK's pendingDustTokens mechanism.
//
//   Phase 1 — Balance all txs sequentially (each call marks spent dust as pending
//             in CoreWallet via spendCoins, so the next call picks different UTXOs)
//   Phase 2 — Sign and finalize all txs (proof server calls, done sequentially
//             because proofs may depend on prior tx's contract state mutations)
//   Phase 3 — Submit all finalized txs to the mempool sequentially (await each
//             before sending the next so mempool ordering is deterministic)
//
// This eliminates the need to wait for block confirmation between txs while still
// producing valid proofs and respecting mempool ordering constraints.

import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  type FinalizedTransaction,
  Transaction as LedgerV6Transaction,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v7";
import { fromHex } from "@midnight-ntwrk/midnight-js-utils";
import type {
  PublicDataProvider,
  UnboundTransaction,
} from "@midnight-ntwrk/midnight-js-types";
import type { BalancingRecipe } from "@midnight-ntwrk/wallet-sdk-facade";
import {
  buildWalletFacade,
  type NetworkUrls,
  registerNightForDust,
  syncAndWaitForFunds,
  waitForDustFunds,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import * as fs from "node:fs";

// Custom logger for debugging
function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync("batcher-debug.log", logMessage);
  } catch (e) {
    // Ignore if we can't write
  }
  console.log(message);
}

// ---------------------------------------------------------------------------
// Config & types
// ---------------------------------------------------------------------------

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
type DelegatedTx =
  | UnprovenTransaction
  | UnboundTransaction
  | FinalizedTransaction;

interface DelegatedTxEntry {
  tx: DelegatedTx;
  txStage: DelegatedTxStage;
}

// Each batch contains multiple transactions balanced speculatively
// (no block confirmation needed between them) via pendingDustTokens.
interface DelegatedBatchData {
  txs: DelegatedTxEntry[];
  selectedInputs: DefaultBatcherInput[];
}

// Per-tx result tracked through the three-phase pipeline.
interface TxPipelineEntry {
  entry: DelegatedTxEntry;
  recipe?: BalancingRecipe;
  finalized?: FinalizedTransaction;
  hash?: string;
  error?: Error;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Midnight Balancing Adapter (Party B)
 *
 * Receives serialized delegated transactions (hex), balances them with local
 * dust funds using the wallet SDK's speculative chaining, generates proofs,
 * and submits them to the blockchain.
 */
export class MidnightBalancingAdapter
  implements BlockchainAdapter<DelegatedBatchData> {
  private readonly config: MidnightBalancingAdapterConfig;
  private readonly walletNetworkId: WalletNetworkId.NetworkId;
  private readonly walletFundingTimeoutMs: number;
  private readonly syncProtocolName: string;
  private readonly walletSeed: string;

  private walletResult: WalletResult | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private walletAddress: string | null = null;
  private publicDataProvider: PublicDataProvider | null = null;

  constructor(
    walletSeed: string,
    config: MidnightBalancingAdapterConfig,
  ) {
    this.walletSeed = walletSeed;
    this.config = config;
    this.walletNetworkId = config.walletNetworkId ??
      ("undeployed" as WalletNetworkId.NetworkId);
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 180) *
      1000;
    this.syncProtocolName = config.syncProtocolName ??
      `Midnight-Balancing (${this.walletNetworkId})`;

    this.initializationPromise = this.initialize(walletSeed);
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  private async reconnect(): Promise<void> {
    console.log("[balancing] Reconnecting wallet...");
    debugLog("[balancing] Reconnecting wallet...");
    this.isInitialized = false;
    this.walletResult = null;
    this.config.walletResult = undefined; // Force rebuild instead of using shared
    this.initializationPromise = this.initialize(this.walletSeed);
    await this.initializationPromise;
  }

  private async initialize(walletSeed: string): Promise<void> {
    try {
      setNetworkId(this.walletNetworkId as any);

      if (this.config.walletResult) {
        console.log("[balancing] Using shared wallet");
        this.walletResult = await this.config.walletResult;
      } else {
        console.log("[balancing] Building wallet...");
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
          this.walletNetworkId,
        );
      }

      this.walletAddress = this.walletResult.zswapSecretKeys.coinPublicKey
        .toString();

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

      console.log("[balancing] Wallet built, waiting for funds...");
      await this.ensureFunds();
      this.isInitialized = true;
      console.log("[balancing] Adapter ready");
    } catch (error) {
      console.error("[balancing] Initialization failed:", error);
      throw error;
    }
  }

  private async ensureFunds(): Promise<void> {
    if (!this.walletResult) return;

    const balances = await syncAndWaitForFunds(this.walletResult.wallet, {
      timeoutMs: this.walletFundingTimeoutMs,
      waitNonZero: false,
    });

    if (balances.dustBalance === 0n && balances.unshieldedBalance > 0n) {
      console.log("[balancing] Registering NIGHT for dust generation...");
      try {
        await registerNightForDust(this.walletResult);
      } catch (error) {
        console.warn("[balancing] Dust registration failed:", error);
      }
    }

    const dustBalance = await waitForDustFunds(this.walletResult.wallet, {
      timeoutMs: this.walletFundingTimeoutMs,
      waitNonZero: true,
    });

    console.log(`[balancing] Dust balance: ${dustBalance}`);
    if (dustBalance === 0n) {
      console.warn(
        "[balancing] WARNING: 0 dust balance, submissions will fail",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Interface: identity & readiness
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Deserialization helpers
  // -----------------------------------------------------------------------

  /**
   * Parse input, handling both plain hex and JSON `{ tx, txStage }` format.
   */
  private parseHexInput(input: string): {
    hex: string;
    txStage?: DelegatedTxStage;
  } {
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
        throw new Error(
          "txStage must be 'unproven', 'unbound', or 'finalized'",
        );
      }
      const hex = parsed.tx.startsWith("0x") ? parsed.tx.slice(2) : parsed.tx;
      return { hex, txStage: parsed.txStage };
    }
    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return { hex };
  }

  /**
   * Deserialize one input into a DelegatedTxEntry.
   */
  private deserializeTxEntry(input: DefaultBatcherInput): DelegatedTxEntry {
    const { hex, txStage } = this.parseHexInput(input.input);
    const bytes = fromHex(hex);

    if (txStage === "unbound") {
      return {
        tx: LedgerV6Transaction.deserialize(
          "signature" as const,
          "proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnboundTransaction,
        txStage: "unbound",
      };
    }

    if (txStage === "finalized") {
      return {
        tx: LedgerV6Transaction.deserialize(
          "signature" as const,
          "proof" as const,
          "binding" as const,
          bytes,
        ) as FinalizedTransaction,
        txStage: "finalized",
      };
    }

    if (txStage === "unproven") {
      return {
        tx: LedgerV6Transaction.deserialize(
          "signature" as const,
          "pre-proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnprovenTransaction,
        txStage: "unproven",
      };
    }

    // Auto-detect: try unbound first, fall back to unproven
    try {
      return {
        tx: LedgerV6Transaction.deserialize(
          "signature" as const,
          "proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnboundTransaction,
        txStage: "unbound",
      };
    } catch {
      return {
        tx: LedgerV6Transaction.deserialize(
          "signature" as const,
          "pre-proof" as const,
          "pre-binding" as const,
          bytes,
        ) as UnprovenTransaction,
        txStage: "unproven",
      };
    }
  }

  // -----------------------------------------------------------------------
  // Batch building
  // -----------------------------------------------------------------------

  /**
   * Deserialize inputs into a batch.
   *
   * Unlike the previous implementation this does NOT try to cap the batch to
   * a cached dust UTXO count. The wallet SDK's `getAvailableCoinsWithGeneratedDust`
   * and `pendingDustTokens` already handle coin availability — if a balance call
   * runs out of dust it will throw, which `submitBatch` handles per-entry.
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<DelegatedBatchData> | null {
    if (inputs.length === 0) return null;

    const txs: DelegatedTxEntry[] = [];
    const selectedInputs: DefaultBatcherInput[] = [];

    for (const input of inputs) {
      try {
        txs.push(this.deserializeTxEntry(input));
        selectedInputs.push(input);
      } catch (error) {
        console.error(
          `[balancing] Deserialize failed for ${input.target}:`,
          error,
        );
        debugLog(
          `[balancing] Deserialize failed for ${input.target}: ${error}`,
        );
        // Stop at first bad input to keep accounting sequential
        break;
      }
    }

    if (txs.length === 0) return null;

    debugLog(`[balancing] Built batch of ${txs.length} tx(s)`);
    return { selectedInputs, data: { txs, selectedInputs } };
  }

  // -----------------------------------------------------------------------
  // Core pipeline
  // -----------------------------------------------------------------------

  /**
   * Balance a single entry against the dust wallet.
   *
   * Each call speculatively marks consumed dust UTXOs as pending via
   * `CoreWallet.spendCoins` / `pendingDustTokens`, so the next call in the
   * same batch automatically picks different UTXOs — no on-chain confirmation
   * needed between calls.
   */
  private async balanceEntry(
    entry: DelegatedTxEntry,
  ): Promise<BalancingRecipe> {
    const keys = {
      shieldedSecretKeys: this.walletResult!.walletZswapSecretKeys,
      dustSecretKey: this.walletResult!.walletDustSecretKey,
    };
    const opts = { ttl: createTtl() };

    switch (entry.txStage) {
      case "unbound":
        return this.walletResult!.wallet.balanceUnboundTransaction(
          entry.tx as UnboundTransaction,
          keys,
          opts,
        );
      case "finalized":
        return this.walletResult!.wallet.balanceFinalizedTransaction(
          entry.tx as FinalizedTransaction,
          keys,
          opts,
        );
      case "unproven":
        return this.walletResult!.wallet.balanceUnprovenTransaction(
          entry.tx as UnprovenTransaction,
          keys,
          opts,
        );
    }
  }

  /**
   * Three-phase pipeline: balance → finalize → submit.
   *
   * Phase 1 (balance): Sequential. Each balance call updates the wallet's
   * pending dust state so the next call sees different available UTXOs.
   * This is the speculative chaining that eliminates the wait-for-block
   * bottleneck.
   *
   * Phase 2 (sign + finalize): Sequential. Uses `finalizeRecipe` which
   * handles all three recipe types and internally adds the finalized tx
   * to the wallet's pending transaction set. Sequential because proofs
   * may depend on prior tx contract state.
   *
   * Phase 3 (submit): Sequential with await. Ensures deterministic mempool
   * ordering and lets the wallet observe each submission for state tracking.
   */
  async submitBatch(
    batchData: DelegatedBatchData,
    _fee?: string | bigint,
  ): Promise<BlockchainHash> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    if (!this.walletResult) {
      throw new Error("Adapter not initialized");
    }

    const { txs } = batchData;
    const pipeline: TxPipelineEntry[] = txs.map((entry) => ({ entry }));

    debugLog(`[balancing] Processing batch of ${txs.length} tx(s)`);

    // --- Phase 1: Balance all txs (speculative chaining) ---
    for (let i = 0; i < pipeline.length; i++) {
      const p = pipeline[i];
      const label = `${i + 1}/${pipeline.length}`;
      try {
        debugLog(
          `[balancing] Phase 1 — balance tx ${label} (${p.entry.txStage})`,
        );
        p.recipe = await this.balanceEntry(p.entry);
      } catch (error) {
        p.error = error instanceof Error ? error : new Error(String(error));
        debugLog(
          `[balancing] Balance failed for tx ${label}: ${p.error.message}`,
        );
        // If balance fails (e.g. out of dust), skip remaining txs in batch
        // because the wallet state may be inconsistent for further balancing.
        for (let j = i + 1; j < pipeline.length; j++) {
          pipeline[j].error = new Error(
            `Skipped: prior tx ${label} failed to balance`,
          );
        }
        break;
      }
    }

    // --- Phase 2: Sign and finalize ---
    for (let i = 0; i < pipeline.length; i++) {
      const p = pipeline[i];
      if (p.error || !p.recipe) continue;

      const label = `${i + 1}/${pipeline.length}`;
      try {
        debugLog(`[balancing] Phase 2 — finalize tx ${label}`);

        const signedRecipe = await this.walletResult.wallet.signRecipe(
          p.recipe,
          (payload: Uint8Array) =>
            this.walletResult!.unshieldedKeystore.signData(payload),
        );

        // finalizeRecipe handles all three recipe types (FINALIZED_TRANSACTION,
        // UNBOUND_TRANSACTION, UNPROVEN_TRANSACTION) and adds the result to
        // the wallet's pending transaction tracking.
        p.finalized = await this.walletResult.wallet.finalizeRecipe(
          signedRecipe,
        );
      } catch (error) {
        p.error = error instanceof Error ? error : new Error(String(error));
        debugLog(
          `[balancing] Finalize failed for tx ${label}: ${p.error.message}`,
        );
        // Don't cascade — later txs may still finalize independently.
      }
    }

    // --- Phase 3: Submit sequentially ---
    let hasDroppedFirst = false;
    const submitPromises: Promise<void>[] = [];

    for (let i = 0; i < pipeline.length; i++) {
      const p = pipeline[i];
      if (p.error || !p.finalized) continue;

      const label = `${i + 1}/${pipeline.length}`;
      let txHashStr = "";
      
      debugLog(`[balancing] Submitting tx ${label} to node...`);

      txHashStr = p.finalized.transactionHash().toString();
      p.hash = txHashStr;

      const submitPromise = this.walletResult!.wallet.submitTransaction(
        p.finalized,
      )
        .then((data) => {
          debugLog(`[balancing] Submission data: ${JSON.stringify(data)}`);
          debugLog(`[balancing] Submission successful for tx ${label}`);
          debugLog(`[balancing] Submitted tx ${label}: ${p.hash}`);
        })
        .catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          const errMsg = err.message.trim();
          // Only drop if it's EXACTLY the mempool full error. Any other details mean it should stay in the queue.
          if (
            errMsg ===
              "Transaction submission error: Transaction got dropped, the mempool likely is full and network congested" ||
            errMsg ===
              "Transaction got dropped, the mempool likely is full and network congested"
          ) {
            if (!hasDroppedFirst) {
              debugLog(
                `[balancing] Submit failed for tx ${label} due to expected dropped error. Marking as dropped to remove from queue (first in batch).`,
              );
              p.hash = "dropped_" + (txHashStr || Date.now() + "_" + i);
              p.error = undefined;
              hasDroppedFirst = true;
            } else {
              debugLog(
                `[balancing] Submit failed for tx ${label} with dropped error, but keeping in queue since a prior tx was already dropped.`,
              );
              p.error = err;
              p.hash = undefined;
            }
          } else if (
            errMsg === "Transaction submission error: Transaction submission failed" ||
            errMsg === "Transaction submission failed" ||
            errMsg.includes("Invalid Transaction")
          ) {
            debugLog(
              `[balancing] Submit failed for tx ${label} due to unprocessable error. Marking as dropped to remove from queue.`,
            );
            p.hash = "dropped_" + (txHashStr || Date.now() + "_" + i);
            p.error = undefined;
          } else {
            p.error = err;
            p.hash = undefined; // clear hash if it failed
            debugLog(
              `[balancing] Submit failed for tx ${label}: ${p.error.message}`,
            );
          }
        });

      submitPromises.push(submitPromise);

      // Wait 100ms before submitting the next element in the pipeline
      if (i < pipeline.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Wait for all submissions to finish
    await Promise.all(submitPromises);

    // --- Collect results ---
    const succeeded = pipeline.filter((p) => p.hash != null);
    const failed = pipeline.filter((p) => p.error != null);

    debugLog(
      `[balancing] Batch results: ${succeeded.length} succeeded, ${failed.length} failed`,
    );

    if (failed.length > 0) {
      console.warn(
        `[balancing] Batch: ${succeeded.length} succeeded, ${failed.length} failed`,
      );
      for (const p of failed) {
        console.warn(`  - ${p.entry.txStage}: ${p.error!.message}`);
      }

      // Remove failed inputs from selectedInputs so the batcher doesn't mark them as processed
      for (let i = pipeline.length - 1; i >= 0; i--) {
        if (pipeline[i].error != null) {
          debugLog(
            `[balancing] Removing failed input at index ${i} from selectedInputs`,
          );
          batchData.selectedInputs.splice(i, 1);
        }
      }
    }

    if (succeeded.length === 0) {
      debugLog(`[balancing] All transactions failed`);
      const firstErrorMsg = pipeline[0].error?.message ?? "unknown";

      if (firstErrorMsg.includes("No dust tokens found in the wallet state")) {
        debugLog(
          `[balancing] Wallet entered bad state. Triggering reconnect...`,
        );
        try {
          await this.reconnect();
        } catch (reconnectError) {
          debugLog(`[balancing] Reconnect failed: ${reconnectError}`);
        }
      }

      throw new Error(
        `All ${pipeline.length} transactions in batch failed. ` +
          `First error: ${firstErrorMsg}`,
      );
    }

    // Return a comma-separated list of successful hashes.
    // The batcher framework treats this as an opaque string and passes it to waitForTransactionReceipt.
    const finalHashes = succeeded.map((p) => p.hash!).join(",");
    debugLog(`[balancing] Returning hashes: ${finalHashes}`);
    return finalHashes;
  }

  // -----------------------------------------------------------------------
  // Interface: receipt polling
  // -----------------------------------------------------------------------

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 300000, // 5 minutes default
  ): Promise<BlockchainTransactionReceipt> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    // Ensure we use a sufficiently long timeout for Midnight (at least 5 minutes)
    const effectiveTimeout = Math.max(timeout, 300000);

    const hashes = hash.split(",");
    let lastReceipt: BlockchainTransactionReceipt | null = null;

    debugLog(
      `[balancing] waitForTransactionReceipt called with hashes: ${hash}, effective timeout: ${effectiveTimeout}`,
    );

    for (const h of hashes) {
      const receipt = await this.waitForSingleReceipt(h, effectiveTimeout);
      if (!h.startsWith("dropped_") || !lastReceipt) {
        lastReceipt = receipt;
      }
    }

    return {
      ...lastReceipt!,
      hash, // Return the original comma-separated hash string so the batcher can split it
    };
  }

  private async waitForSingleReceipt(
    hash: string,
    timeout: number,
  ): Promise<BlockchainTransactionReceipt> {
    if (hash.startsWith("dropped_")) {
      debugLog(`[balancing] Skipping receipt wait for dropped tx: ${hash}`);
      return {
        hash,
        blockNumber: 0n,
        status: 0,
      };
    }

    debugLog(
      `[balancing] Waiting for receipt for ${hash} (timeout: ${timeout}ms)...`,
    );
    const startTime = Date.now();
    let normalizedHash = hash.toLowerCase().replace(/^0x/, "");
    if (normalizedHash.length > 64) {
      normalizedHash = normalizedHash.slice(-64);
    } else if (normalizedHash.length < 64) {
      normalizedHash = normalizedHash.padStart(64, "0");
    }

    const query = `query ($hash: String!) {
      transactions(offset: { hash: $hash }) {
        hash
        block { height }
      }
    }`;

    let lastLogTime = startTime;
    while (Date.now() - startTime < timeout) {
      const now = Date.now();
      if (now - lastLogTime > 10000) { // Log every 10 seconds
        debugLog(
          `[balancing] Still waiting for ${hash} (${
            Math.round((now - startTime) / 1000)
          }s elapsed)...`,
        );
        lastLogTime = now;
      }

      try {
        const response = await fetch(this.config.indexer, {
          method: "POST",
          body: JSON.stringify({
            query,
            variables: { hash: normalizedHash },
          }),
          headers: { "Content-Type": "application/json" },
        });

        const body = await response.json();

        // Log the raw response if it's not what we expect
        if (!body || !body.data || !body.data.transactions) {
          debugLog(
            `[balancing] Unexpected indexer response for ${hash}: ${
              JSON.stringify(body)
            }`,
          );
        }

        const tx = body.data?.transactions?.[0];

        if (tx?.block) {
          debugLog(
            `[balancing] Found receipt for ${hash} at block ${tx.block.height}`,
          );
          return {
            hash,
            blockNumber: BigInt(tx.block.height),
            status: 1,
          };
        }
      } catch (err) {
        debugLog(`[balancing] Receipt query error for ${hash}: ${err}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    debugLog(
      `[balancing] Transaction confirmation timeout for ${hash} after ${timeout}ms`,
    );
    throw new Error(`Transaction confirmation timeout: ${hash}`);
  }

  // -----------------------------------------------------------------------
  // Interface: misc
  // -----------------------------------------------------------------------

  estimateBatchFee(_data: DelegatedBatchData): bigint {
    return 0n; // Dust fees are handled internally by the wallet SDK
  }

  verifySignature(_input: DefaultBatcherInput): boolean {
    return true; // Signature lives inside the Midnight tx, validated by ledger
  }

  validateInput(input: DefaultBatcherInput): ValidationResult {
    try {
      const { hex } = this.parseHexInput(input.input);
      if (!/^[0-9a-fA-F]+$/.test(hex)) {
        return { valid: false, error: "Input is not valid hex" };
      }
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async getBlockNumber(): Promise<bigint> {
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
