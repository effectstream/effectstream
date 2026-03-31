// Midnight balancing adapter for the EffectStream batcher
// Handles delegated balancing (Party B) where unproven transactions are received,
// balanced with filler funds, proved, and submitted.
//
// Architecture: worker pool with per-wallet balance mutex.
//
// Each worker = {wallet, UTXO-slot} — an independent processing unit.
// Workers run their tx pipeline in parallel:
//
//   acquire balance lock → balance → release lock → prove/finalize → submit
//
// The balance lock serializes balance calls within the same wallet
// (speculative chaining requires sequential dust allocation). Prove,
// finalize, and submit overlap freely — including with other workers'
// balance phase on the same wallet, enabling deep pipelining.
//
// Worker selection:
//   1. Prefer wallets with the fewest busy workers (maximize wallet spread)
//   2. Tiebreak: lowest usage count (balance load)

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
} from "@midnight-ntwrk/ledger-v8";
import { fromHex } from "@midnight-ntwrk/midnight-js-utils";
import type {
  PublicDataProvider,
  UnboundTransaction,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  BalancingRecipe,
  ShieldedTokenTransfer,
} from "@midnight-ntwrk/wallet-sdk-facade";
import {
  buildWalletFacade,
  getInitialDustState,
  getInitialShieldedState,
  type NetworkUrls,
  registerNightForDust,
  waitForDustFunds,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { AdapterLogger } from "./adapter-logger.ts";
import { WorkerPool } from "./worker-pool.ts";

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
  addShieldedPadding?: boolean;
  // Token type ID used for the shielded self-transfer padding. Required when addShieldedPadding is true.
  // **NOTE for development:** "0000000000000000000000000000000000000000000000000000000000000000" can be used for undeployed + genesis wallet.
  shieldedPaddingTokenID?: string;
  // Maximum number of worker slots (concurrent txs) per wallet. Defaults to 1.
  // Regardless of how many dust UTXOs a wallet has, at most this many will be used in parallel.
  maxSlotsPerWallet?: number;
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const SUBMIT_TX_TIMEOUT_MS = 90 * 1000;
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

/** Short 8-char hex hash of the input payload for tracing duplicates from the app. */
function inputContentHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

type DelegatedTxStage = "unproven" | "unbound" | "finalized";
type DelegatedTx =
  | UnprovenTransaction
  | UnboundTransaction
  | FinalizedTransaction;

interface DelegatedTxEntry {
  tx: DelegatedTx;
  txStage: DelegatedTxStage;
  /** Per-input override: true/false overrides the config default, undefined uses config. */
  addShieldedPadding?: boolean;
}

/** Per-tx tracing metadata assigned at buildBatchData time. */
interface TxTraceInfo {
  /** e.g. "B04:1" — batch 4, tx index 1 */
  label: string;
  /** 8-char hex hash of the raw input payload (for tracing duplicates from the app) */
  contentHash: string;
  /** Retry attempt (0 = first try) */
  retry: number;
}

interface DelegatedBatchData {
  txs: DelegatedTxEntry[];
  selectedInputs: DefaultBatcherInput[];
  /** Each tx maps to the worker that will process it. */
  workerAssignments: { walletIdx: number; slotIdx: number }[];
  /** Snapshot of reserved input keys, taken at buildBatchData time.
   *  Used by releaseBatchResources to clear inFlightInputKeys even
   *  when submitBatch has mutated selectedInputs (e.g. spliced out failures). */
  reservedInputKeys: string[];
  /** Per-tx tracing metadata. */
  traceInfos: TxTraceInfo[];
  /** Batch sequence number. */
  batchId: number;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Midnight Balancing Adapter (Party B)
 *
 * Receives serialized delegated transactions (hex), balances them with local
 * dust funds, generates proofs, and submits them to the blockchain.
 *
 * Uses a worker pool where each worker = {wallet, UTXO-slot}. Workers run
 * their tx pipeline independently with a per-wallet balance mutex for
 * speculative chaining correctness.
 */
export class MidnightBalancingAdapter
  implements BlockchainAdapter<DelegatedBatchData> {
  private readonly config: MidnightBalancingAdapterConfig;
  private readonly walletNetworkId: WalletNetworkId.NetworkId;
  private readonly walletFundingTimeoutMs: number;
  private readonly syncProtocolName: string;
  private readonly walletSeeds: string[];
  private readonly log = new AdapterLogger("balancing");

  private walletResults: (WalletResult | null)[];
  private walletAddresses: (string | null)[];
  private walletInitialized: boolean[];
  private availableDustUtxoCounts: (number | null)[];
  /** Tracks wallets that recently failed due to missing dust. Cleared when dust is confirmed available. */
  private walletDustExhausted: boolean[];

  /** Worker pool — initialized with 0 slots, updated per wallet after init. */
  private readonly pool: WorkerPool;
  /** Input keys currently being processed in a concurrent batch. */
  private readonly inFlightInputKeys = new Set<string>();

  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private publicDataProvider: PublicDataProvider | null = null;
  private batchCounter = 0;

  constructor(
    walletSeed: string | string[],
    config: MidnightBalancingAdapterConfig,
  ) {
    const seeds = Array.isArray(walletSeed) ? walletSeed : [walletSeed];
    this.walletSeeds = seeds;
    this.config = config;
    this.walletNetworkId = config.walletNetworkId ??
      ("undeployed" as WalletNetworkId.NetworkId);
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 600) *
      1000;
    this.syncProtocolName = config.syncProtocolName ??
      `Midnight-Balancing (${this.walletNetworkId})`;

    this.walletResults = new Array(seeds.length).fill(null);
    this.walletAddresses = new Array(seeds.length).fill(null);
    this.walletInitialized = new Array(seeds.length).fill(false);
    this.availableDustUtxoCounts = new Array(seeds.length).fill(null);
    this.walletDustExhausted = new Array(seeds.length).fill(false);

    // Start with 0 slots per wallet; updated in ensureWalletFunds once UTXO counts are known.
    this.pool = new WorkerPool(new Array(seeds.length).fill(0));

    this.initializationPromise = this.initialize();
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  private async initialize(): Promise<void> {
    try {
      this.log.log(
        `Initializing Midnight Balancing Adapter (${this.walletSeeds.length} wallet(s))...`,
      );
      setNetworkId(this.walletNetworkId as any);

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

      await Promise.all(
        this.walletSeeds.map((seed, i) => this.initializeWallet(i, seed)),
      );

      const readyCount = this.walletInitialized.filter(Boolean).length;
      if (readyCount === 0) {
        throw new Error("All wallets failed to initialize");
      }

      this.isInitialized = true;
      this.log.log(
        `Adapter ready (${readyCount}/${this.walletSeeds.length} wallets, ` +
          `${this.pool.getTotalWorkerCount()} workers: ${this.pool.getStatus()})`,
      );
    } catch (error) {
      this.log.error("Initialization failed:", error);
      throw error;
    }
  }

  private async initializeWallet(index: number, seed: string): Promise<void> {
    const label = `${index + 1}/${this.walletSeeds.length}`;
    try {
      if (index === 0 && this.config.walletResult) {
        this.log.log(`Wallet ${label}: using shared wallet (stopping shielded/unshielded sync)`);
        this.walletResults[index] = await this.config.walletResult;
        const wallet = this.walletResults[index]!.wallet;
        await Promise.all([
          (wallet.shielded as any).stop?.().catch(() => {}),
          (wallet.unshielded as any).stop?.().catch(() => {}),
        ]);
      } else {
        this.log.log(`Wallet ${label}: building...`);
        const networkUrls: Required<NetworkUrls> = {
          id: this.walletNetworkId,
          indexer: this.config.indexer,
          indexerWS: this.config.indexerWS,
          node: this.config.node,
          proofServer: this.config.proofServer,
        };
        this.walletResults[index] = await buildWalletFacade(
          networkUrls,
          seed,
          this.walletNetworkId,
          'dust-only',
        );
      }

      const wr = this.walletResults[index]!;
      this.walletAddresses[index] = wr.zswapSecretKeys.coinPublicKey.toString();
      this.log.log(`Wallet ${label} addresses:`);
      this.log.log(`  shielded:   ${this.walletAddresses[index]}`);
      this.log.log(`  unshielded: ${wr.unshieldedAddress}`);
      this.log.log(`  dust:       ${wr.dustAddress}`);

      this.log.log(`Wallet ${label}: waiting for funds...`);
      await this.ensureWalletFunds(index);
      this.walletInitialized[index] = true;
      this.log.log(`Wallet ${label}: ready`);
    } catch (error) {
      this.log.error(`Wallet ${label}: initialization failed:`, error);
    }
  }

  private async ensureWalletFunds(walletIndex: number): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    // Balancer only needs dust — wait for dust sync first, try unshielded registration as fallback
    let dustBalance = await waitForDustFunds(walletResult.wallet, {
      timeoutMs: this.walletFundingTimeoutMs,
      waitNonZero: false,
    });

    if (dustBalance === 0n) {
      this.log.log(`Wallet ${label}: no dust yet, trying unshielded→dust registration (requires unshielded wallet to be running)...`);
      try {
        await registerNightForDust(walletResult);
        dustBalance = await waitForDustFunds(walletResult.wallet, {
          timeoutMs: this.walletFundingTimeoutMs,
          waitNonZero: true,
        });
      } catch (error) {
        this.log.warn(`Wallet ${label}: dust registration failed (in dust-only mode, wallet must be pre-funded with dust):`, error);
      }
    }

    this.log.log(`Wallet ${label}: dust balance: ${dustBalance}`);
    if (dustBalance === 0n) {
      this.log.warn(
        `Wallet ${label}: WARNING: 0 dust balance, submissions will fail`,
      );
    } else if (this.config.addShieldedPadding) {
      this.log.log(
        `Wallet ${label}: shielded padding enabled, each tx will consume 2 dust UTXOs`,
      );
    }

    try {
      const dustState = await getInitialDustState(
        // deno-lint-ignore no-explicit-any
        (walletResult.wallet as any).dust,
      );

      const bigintSerializer = (_: string, value: unknown) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      };

      // deno-lint-ignore no-explicit-any
      this.availableDustUtxoCounts[walletIndex] =
        dustState.availableCoins?.length ?? null;
      this.log.log(
        `Wallet ${label}: dust coins: ${
          JSON.stringify(dustState.availableCoins, bigintSerializer)
        }`,
      );
      this.log.log(
        `Wallet ${label}: available dust UTXOs: ${
          this.availableDustUtxoCounts[walletIndex] ?? "unknown"
        }`,
      );

      // Update worker pool: 1 worker per UTXO (2 UTXOs per worker if padding).
      // When shieldedPaddingTokenID is configured, per-input overrides can
      // enable padding even if the config default is off, so budget for the
      // worst case (2 UTXOs/slot) to avoid over-committing.
      const utxoCount = this.availableDustUtxoCounts[walletIndex] ?? 0;
      const paddingPossible = !!(this.config.addShieldedPadding ||
        this.config.shieldedPaddingTokenID);
      const costPerTx = paddingPossible ? 2 : 1;
      const maxPerWallet = this.config.maxSlotsPerWallet ?? 1;
      const slots = Math.min(Math.floor(utxoCount / costPerTx), maxPerWallet);
      this.pool.setSlots(walletIndex, slots);
      this.log.log(
        `Wallet ${label}: worker slots: ${slots} (${utxoCount} UTXOs, cost=${costPerTx}/tx, cap=${maxPerWallet})`,
      );
    } catch (e) {
      this.log.warn(`Wallet ${label}: could not read dust UTXO count:`, e);
    }
  }

  // -----------------------------------------------------------------------
  // Interface: identity & readiness
  // -----------------------------------------------------------------------

  getAccountAddress(): string {
    const first = this.walletAddresses.find((a) => a !== null);
    return first ?? "unknown";
  }

  getChainName(): string {
    return `Midnight-Balancing (${this.walletNetworkId})`;
  }

  getSyncProtocolName(): string {
    return this.syncProtocolName;
  }

  isReady(): boolean {
    return this.isInitialized && this.walletInitialized.some(Boolean);
  }

  // -----------------------------------------------------------------------
  // Concurrent capacity
  // -----------------------------------------------------------------------

  private getInputKey(input: DefaultBatcherInput): string {
    return `${input.address}|${input.timestamp}|${input.input}`;
  }

  hasAvailableCapacity(): boolean {
    if (!this.isReady()) return false;
    return this.pool.hasAvailableWorker();
  }

  isFullyIdle(): boolean {
    return this.pool.isFullyIdle();
  }

  releaseBatchResources(batchData: DelegatedBatchData): void {
    for (const wa of batchData.workerAssignments) {
      this.pool.releaseWorker(wa.walletIdx, wa.slotIdx);
    }
    // Use the snapshot taken at buildBatchData time, not the possibly-mutated
    // selectedInputs array (submitBatch splices out failed inputs).
    for (const key of batchData.reservedInputKeys) {
      this.inFlightInputKeys.delete(key);
    }
    const bTag = `B${String(batchData.batchId).padStart(2, "0")}`;
    this.log.log(
      `[${bTag}] Released ${batchData.workerAssignments.length} worker(s), ` +
        `${batchData.reservedInputKeys.length} input(s) [pool: ${this.pool.getStatus()}]`,
    );
  }

  // -----------------------------------------------------------------------
  // Deserialization helpers
  // -----------------------------------------------------------------------

  private parseHexInput(input: string): {
    hex: string;
    txStage?: DelegatedTxStage;
    addShieldedPadding?: boolean;
  } {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed) as {
        tx?: string;
        txStage?: DelegatedTxStage;
        addShieldedPadding?: boolean | null;
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
      const addShieldedPadding = parsed.addShieldedPadding ?? undefined;
      return { hex, txStage: parsed.txStage, addShieldedPadding };
    }
    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return { hex };
  }

  private deserializeTxEntry(input: DefaultBatcherInput): DelegatedTxEntry {
    const { hex, txStage, addShieldedPadding } = this.parseHexInput(
      input.input,
    );
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
        addShieldedPadding,
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
        addShieldedPadding,
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
        addShieldedPadding,
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
        addShieldedPadding,
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
        addShieldedPadding,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Batch building — worker pool assignment
  // -----------------------------------------------------------------------

  /**
   * Assign each available input to a free worker via the pool's selection
   * algorithm. Each worker handles exactly 1 tx. Workers and input keys
   * are marked as reserved synchronously (no race possible).
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<DelegatedBatchData> | null {
    if (inputs.length === 0) return null;

    const availableInputs = inputs.filter(
      (input) => !this.inFlightInputKeys.has(this.getInputKey(input)),
    );
    if (availableInputs.length === 0) return null;

    const batchId = ++this.batchCounter;
    const txs: DelegatedTxEntry[] = [];
    const selectedInputs: DefaultBatcherInput[] = [];
    const workerAssignments: { walletIdx: number; slotIdx: number }[] = [];
    const traceInfos: TxTraceInfo[] = [];

    // Prefer wallets that are known to have dust. Falls back to exhausted
    // wallets if all are exhausted (the pipeline will wait for regeneration).
    const dustFilter = (walletIdx: number): boolean =>
      !this.walletDustExhausted[walletIdx];

    for (const input of availableInputs) {
      const worker = this.pool.acquireWorker(dustFilter);
      if (!worker) break; // no free workers

      let entry: DelegatedTxEntry;
      try {
        entry = this.deserializeTxEntry(input);
      } catch (error) {
        this.pool.releaseWorker(worker.walletIdx, worker.slotIdx);
        this.log.error(`Deserialize failed for ${input.target}: ${error}`);
        continue; // skip bad input, try next
      }

      const txIdx = txs.length + 1;
      txs.push(entry);
      selectedInputs.push(input);
      workerAssignments.push({
        walletIdx: worker.walletIdx,
        slotIdx: worker.slotIdx,
      });
      traceInfos.push({
        label: `B${String(batchId).padStart(2, "0")}:${txIdx}`,
        contentHash: inputContentHash(input.input),
        retry: input.retryCount ?? 0,
      });
    }

    if (txs.length === 0) return null;

    // Mark inputs as in-flight and snapshot the keys (synchronous)
    const reservedInputKeys: string[] = [];
    for (const input of selectedInputs) {
      const key = this.getInputKey(input);
      this.inFlightInputKeys.add(key);
      reservedInputKeys.push(key);
    }

    const assignments = traceInfos.map((t, i) => {
      const wa = workerAssignments[i];
      const retry = t.retry > 0 ? ` retry=${t.retry}` : "";
      return `${t.label}/W${wa.walletIdx + 1}:s${wa.slotIdx} #${t.contentHash}${retry}`;
    }).join(", ");
    this.log.log(
      `Built batch B${String(batchId).padStart(2, "0")}: ${txs.length} tx(s) [${assignments}] [pool: ${this.pool.getStatus()}]`,
    );
    return {
      selectedInputs,
      data: { txs, selectedInputs, workerAssignments, reservedInputKeys, traceInfos, batchId },
    };
  }

  // -----------------------------------------------------------------------
  // Core pipeline helpers
  // -----------------------------------------------------------------------

  private shouldAddShieldedPadding(entry: DelegatedTxEntry): boolean {
    return entry.addShieldedPadding ?? this.config.addShieldedPadding ?? false;
  }

  /**
   * Wait for at least one dust UTXO to become available.
   * Handles the UTXO regeneration race where a worker is reused right after
   * its previous tx confirms but the change output hasn't been indexed yet.
   * Does not throw — if dust remains unavailable the subsequent balance call
   * will fail and the input goes back to the retry queue.
   */
  private async waitForDustAvailability(
    walletIndex: number,
    timeoutMs: number = 60_000,
  ): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    try {
      // deno-lint-ignore no-explicit-any
      const dustState = await getInitialDustState(
        (walletResult.wallet as any).dust,
      );
      if ((dustState.availableCoins?.length ?? 0) > 0) {
        this.walletDustExhausted[walletIndex] = false;
        return;
      }
    } catch {
      return;
    }

    this.log.log(
      `Wallet ${label}: no dust UTXOs yet, waiting up to ${timeoutMs}ms for regeneration...`,
    );
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 1_000));
      try {
        // deno-lint-ignore no-explicit-any
        await (walletResult.wallet as any).dust.waitForSyncedState();
        // deno-lint-ignore no-explicit-any
        const dustState = await getInitialDustState(
          (walletResult.wallet as any).dust,
        );
        if ((dustState.availableCoins?.length ?? 0) > 0) {
          this.log.log(
            `Wallet ${label}: dust available after ${Date.now() - start}ms`,
          );
          this.walletDustExhausted[walletIndex] = false;
          return;
        }
      } catch {
        // Keep polling
      }
    }
    this.walletDustExhausted[walletIndex] = true;
    this.log.warn(
      `Wallet ${label}: dust still unavailable after ${timeoutMs}ms, proceeding to balance (will likely fail and re-queue)`,
    );
  }

  /**
   * Balance a single entry against a specific wallet's dust.
   * CALLER MUST hold the wallet's balance lock.
   */
  private async balanceEntry(
    entry: DelegatedTxEntry,
    walletIndex: number,
  ): Promise<BalancingRecipe> {
    const walletResult = this.walletResults[walletIndex]!;

    // deno-lint-ignore no-explicit-any
    await (walletResult.wallet as any).dust.waitForSyncedState();
    await this.waitForDustAvailability(walletIndex);

    const keys = {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    const opts = { ttl: createTtl() };

    if (this.shouldAddShieldedPadding(entry) && entry.txStage === "unproven") {
      try {
        const paddedTx = await this.applyShieldedPadding(
          entry.tx as UnprovenTransaction,
          true,
          walletIndex,
        );
        entry = { tx: paddedTx, txStage: "unproven" };
      } catch (e) {
        this.log.warn(
          "Shielded padding unavailable, submitting without padding. " +
            `Ensure the batcher wallet has shielded NIGHT tokens. ${e}`,
        );
      }
    }

    let recipe: BalancingRecipe;
    switch (entry.txStage) {
      case "unbound":
        recipe = await walletResult.wallet.balanceUnboundTransaction(
          entry.tx as UnboundTransaction,
          keys,
          opts,
        );
        if (
          this.shouldAddShieldedPadding(entry) && recipe.balancingTransaction
        ) {
          try {
            recipe.balancingTransaction = await this.applyShieldedPadding(
              recipe.balancingTransaction,
              true,
              walletIndex,
            );
          } catch (e) {
            this.log.warn("Shielded padding unavailable: " + e);
          }
        }
        break;
      case "finalized":
        recipe = await walletResult.wallet.balanceFinalizedTransaction(
          entry.tx as FinalizedTransaction,
          keys,
          opts,
        );
        if (
          this.shouldAddShieldedPadding(entry) && recipe.balancingTransaction
        ) {
          try {
            recipe.balancingTransaction = await this.applyShieldedPadding(
              recipe.balancingTransaction,
              true,
              walletIndex,
            );
          } catch (e) {
            this.log.warn("Shielded padding unavailable: " + e);
          }
        }
        break;
      case "unproven":
        recipe = await walletResult.wallet.balanceUnprovenTransaction(
          entry.tx as UnprovenTransaction,
          keys,
          opts,
        );
        break;
    }

    return recipe;
  }

  private async applyShieldedPadding(
    balancingTx: UnprovenTransaction,
    payFees: boolean,
    walletIndex: number,
  ): Promise<UnprovenTransaction> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) throw new Error("Wallet not initialized");

    this.log.log("[balancing] Adding shielded padding...");
    const keys = walletResult.walletZswapSecretKeys;

    // deno-lint-ignore no-explicit-any
    const initialState = await getInitialShieldedState(
      (walletResult.wallet as any).shielded,
    );
    const receiverAddress = initialState.address;
    if (!this.config.shieldedPaddingTokenID) {
      throw new Error(
        "shieldedPaddingTokenID must be set when addShieldedPadding is true",
      );
    }
    const type = this.config.shieldedPaddingTokenID;
    const outputs: ShieldedTokenTransfer[] = [
      { type: "shielded", outputs: [{ type, receiverAddress, amount: 1n }] },
    ];
    const conf = {
      shieldedSecretKeys: keys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    const opt = { ttl: createTtl(), payFees };
    const paddingRecipe = await walletResult.wallet.transferTransaction(
      outputs,
      conf,
      opt,
    );
    return balancingTx.merge(paddingRecipe.transaction);
  }

  // -----------------------------------------------------------------------
  // Per-worker tx pipeline
  // -----------------------------------------------------------------------

  /**
   * Process a single tx through the full pipeline on its assigned worker:
   *   1. Acquire wallet balance lock
   *   2. Balance (speculative chaining — serialized within wallet)
   *   3. Release balance lock
   *   4. Sign + Finalize / Prove (concurrent — proof server is multi-threaded)
   *   5. Submit to mempool
   *
   * Returns the tx hash on success, throws on failure.
   */
  private async processWorkerTx(
    entry: DelegatedTxEntry,
    walletIdx: number,
    slotIdx: number,
    trace: TxTraceInfo,
  ): Promise<string> {
    const walletResult = this.walletResults[walletIdx]!;
    const w = `W${walletIdx + 1}:s${slotIdx}`;
    const tag = `${trace.label}/${w} #${trace.contentHash}`;
    const retryTag = trace.retry > 0 ? ` [retry ${trace.retry}/3]` : "";
    const pipelineStart = performance.now();

    // --- Phase 1: Balance (under wallet lock) ---
    this.log.log(`[${tag}] Acquiring balance lock${retryTag}...`);
    const releaseBalanceLock = await this.pool.acquireBalanceLock(walletIdx);
    let recipe: BalancingRecipe;
    const balanceStart = performance.now();
    try {
      this.log.log(`[${tag}] Balancing (${entry.txStage})...`);
      recipe = await this.balanceEntry(entry, walletIdx);
    } finally {
      releaseBalanceLock();
    }
    const balanceMs = Math.round(performance.now() - balanceStart);
    this.log.log(`[${tag}] Balanced (${balanceMs}ms)`);

    // --- Phase 2: Sign + Finalize (no lock — concurrent safe) ---
    const proveStart = performance.now();
    const signedRecipe = await walletResult.wallet.signRecipe(
      recipe,
      (payload: Uint8Array) =>
        walletResult.unshieldedKeystore.signData(payload),
    );
    const finalized = await walletResult.wallet.finalizeRecipe(signedRecipe);
    const proveMs = Math.round(performance.now() - proveStart);
    this.log.log(`[${tag}] Proved (${proveMs}ms)`);

    // --- Phase 3: Submit ---
    const txHash = finalized.transactionHash().toString();
    this.log.log(`[${tag}] Submitting (hash: ${txHash})...`);
    const submitStart = performance.now();

    try {
      await Promise.race([
        walletResult.wallet.submitTransaction(finalized),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("submitTransaction timed out")),
            SUBMIT_TX_TIMEOUT_MS,
          )
        ),
      ]);
      const submitMs = Math.round(performance.now() - submitStart);
      const totalMs = Math.round(performance.now() - pipelineStart);
      this.log.log(
        `[${tag}] ✅ Submitted (balance=${balanceMs}ms prove=${proveMs}ms submit=${submitMs}ms total=${totalMs}ms)`,
      );
    } catch (error) {
      const errMsg = (error instanceof Error ? error.message : String(error))
        .trim();
      if (errMsg.includes("IntentAlreadyExists")) {
        this.log.log(
          `[${tag}] IntentAlreadyExists — already in mempool, treating as success`,
        );
      } else {
        const submitMs = Math.round(performance.now() - submitStart);
        this.log.error(
          `[${tag}] ❌ Submit failed after ${submitMs}ms: ${errMsg}`,
        );
        throw error;
      }
    }

    return txHash;
  }

  // -----------------------------------------------------------------------
  // Submit batch
  // -----------------------------------------------------------------------

  /**
   * Run per-worker pipelines in parallel. Each worker independently:
   * balance (locked) → prove (unlocked) → submit.
   *
   * Workers are released by releaseBatchResources (called by BatchProcessor
   * in its finally block after all storage operations complete). Workers
   * must NOT be released here — doing so causes a double-release race where
   * a subsequent batch acquires the worker, then releaseBatchResources frees
   * it while the new batch is still using it.
   */
  async submitBatch(
    batchData: DelegatedBatchData,
    _fee?: string | bigint,
  ): Promise<BlockchainHash> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    if (!this.isInitialized) {
      throw new Error("Adapter not initialized");
    }

    return await this._executeWorkerPipelines(batchData);
  }

  private async _executeWorkerPipelines(
    batchData: DelegatedBatchData,
  ): Promise<BlockchainHash> {
    const { txs, workerAssignments, traceInfos, batchId } = batchData;
    const bTag = `B${String(batchId).padStart(2, "0")}`;

    this.log.log(
      `[${bTag}] Processing ${txs.length} tx(s) [pool: ${this.pool.getStatus()}]`,
    );

    // Run all worker pipelines in parallel
    const results = await Promise.allSettled(
      txs.map((entry, i) => {
        const wa = workerAssignments[i];
        return this.processWorkerTx(entry, wa.walletIdx, wa.slotIdx, traceInfos[i]);
      }),
    );

    // Collect successes and failures
    const hashes: string[] = [];
    const errors: { index: number; error: Error }[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        hashes.push(r.value);
      } else {
        errors.push({
          index: i,
          error: r.reason instanceof Error
            ? r.reason
            : new Error(String(r.reason)),
        });
      }
    }

    this.log.log(
      `[${bTag}] Results: ${hashes.length} succeeded, ${errors.length} failed`,
    );

    if (errors.length > 0) {
      for (const { index, error } of errors) {
        const t = traceInfos[index];
        this.log.warn(`  ${t.label} #${t.contentHash}: ${error.message}`);
      }
      // Remove failed inputs from selectedInputs so the batcher retries them
      const failedIndices = new Set(errors.map((e) => e.index));
      for (let i = batchData.selectedInputs.length - 1; i >= 0; i--) {
        if (failedIndices.has(i)) {
          batchData.selectedInputs.splice(i, 1);
        }
      }
    }

    if (hashes.length === 0) {
      const firstError = errors[0]?.error.message ?? "unknown";
      throw new Error(
        `All ${txs.length} transactions failed. First error: ${firstError}`,
      );
    }

    const finalHashes = hashes.join(",");
    this.log.log(`[${bTag}] Hashes: ${finalHashes}`);
    return finalHashes;
  }

  // -----------------------------------------------------------------------
  // Interface: receipt polling
  // -----------------------------------------------------------------------

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 300000,
  ): Promise<BlockchainTransactionReceipt> {
    if (!this.publicDataProvider) {
      throw new Error("Public data provider not initialized");
    }

    const effectiveTimeout = Math.max(timeout, 300000);
    const hashes = hash.split(",");
    let lastReceipt: BlockchainTransactionReceipt | null = null;

    this.log.log(
      `waitForTransactionReceipt: ${hashes.length} hash(es), timeout: ${effectiveTimeout}ms`,
    );

    for (const h of hashes) {
      const receipt = await this.waitForSingleReceipt(h, effectiveTimeout);
      lastReceipt = receipt;
    }

    return { ...lastReceipt!, hash };
  }

  private async waitForSingleReceipt(
    hash: string,
    timeout: number,
  ): Promise<BlockchainTransactionReceipt> {
    this.log.log(`Waiting for receipt for ${hash} (timeout: ${timeout}ms)...`);
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
      if (now - lastLogTime > 10000) {
        this.log.log(
          `Still waiting for ${hash} (${
            Math.round((now - startTime) / 1000)
          }s elapsed)...`,
        );
        lastLogTime = now;
      }

      try {
        const response = await fetch(this.config.indexer, {
          method: "POST",
          body: JSON.stringify({ query, variables: { hash: normalizedHash } }),
          headers: { "Content-Type": "application/json" },
        });
        const body = await response.json();

        if (!body?.data?.transactions) {
          this.log.log(
            `Unexpected indexer response for ${hash}: ${JSON.stringify(body)}`,
          );
        }

        const tx = body.data?.transactions?.[0];
        if (tx?.block) {
          this.log.log(`Found receipt for ${hash} at block ${tx.block.height}`);
          return { hash, blockNumber: BigInt(tx.block.height), status: 1 };
        }
      } catch (err) {
        this.log.log(`Receipt query error for ${hash}: ${err}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.log.log(
      `Transaction confirmation timeout for ${hash} after ${timeout}ms`,
    );
    throw new Error(`Transaction confirmation timeout: ${hash}`);
  }

  // -----------------------------------------------------------------------
  // Interface: misc
  // -----------------------------------------------------------------------

  estimateBatchFee(_data: DelegatedBatchData): bigint {
    return 0n;
  }

  verifySignature(_input: DefaultBatcherInput): boolean {
    return true;
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
