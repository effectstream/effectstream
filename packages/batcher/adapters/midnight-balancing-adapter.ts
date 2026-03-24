// Midnight balancing adapter for the EffectStream batcher
// Handles delegated balancing (Party B) where unproven transactions are received,
// balanced with filler funds, proved, and submitted.
//
// Architecture: speculative chaining via the wallet SDK's pendingDustTokens mechanism.
//
// Multi-wallet support: accepts one or more wallet seeds. Each wallet maintains its
// own dust UTXOs, so N wallets with a per-wallet limit of L allows N*L parallel txs.
//
//   Phase 1 — Balance all txs (sequential within each wallet for speculative
//             chaining, parallel across wallets)
//   Phase 2 — Sign and finalize all txs (sequential within each wallet,
//             parallel across wallets)
//   Phase 3 — Submit all finalized txs to the mempool in staggered order
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
} from "@midnight-ntwrk/ledger-v8";
import { fromHex } from "@midnight-ntwrk/midnight-js-utils";
import type {
  PublicDataProvider,
  UnboundTransaction,
} from "@midnight-ntwrk/midnight-js-types";
import type { BalancingRecipe, ShieldedTokenTransfer } from "@midnight-ntwrk/wallet-sdk-facade";
import {
  buildWalletFacade,
  type NetworkUrls,
  registerNightForDust,
  syncAndWaitForFunds,
  waitForDustFunds,
  type WalletResult,
  getInitialShieldedState,
  getInitialDustState,
} from "@effectstream/midnight-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { AdapterLogger } from "./adapter-logger.ts";

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
  // Maximum number of transactions per wallet in a single batch. Defaults to unlimited.
  // Total batch capacity = maxBatchSize * number_of_wallets.
  maxBatchSize?: number;
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const SUBMIT_TX_TIMEOUT_MS = 90 * 1000; // 1 minute
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

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

// Each batch contains multiple transactions balanced speculatively
// (no block confirmation needed between them) via pendingDustTokens.
interface DelegatedBatchData {
  txs: DelegatedTxEntry[];
  selectedInputs: DefaultBatcherInput[];
  /** Maps each tx index to its assigned wallet index. */
  walletAssignments: number[];
}

// Per-tx result tracked through the three-phase pipeline.
interface TxPipelineEntry {
  entry: DelegatedTxEntry;
  /** Index of the wallet responsible for this tx. */
  walletIndex: number;
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
 *
 * Supports multiple wallets for higher throughput: each wallet has its own
 * dust UTXOs, so N wallets with per-wallet limit L allows N*L concurrent txs.
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
  private nextWalletIndex = 0;

  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private publicDataProvider: PublicDataProvider | null = null;

  constructor(
    walletSeed: string | string[],
    config: MidnightBalancingAdapterConfig,
  ) {
    const seeds = Array.isArray(walletSeed) ? walletSeed : [walletSeed];
    this.walletSeeds = seeds;
    this.config = config;
    this.walletNetworkId = config.walletNetworkId ?? ("undeployed" as WalletNetworkId.NetworkId);
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 180) * 1000;
    this.syncProtocolName = config.syncProtocolName ?? `Midnight-Balancing (${this.walletNetworkId})`;

    this.walletResults = new Array(seeds.length).fill(null);
    this.walletAddresses = new Array(seeds.length).fill(null);
    this.walletInitialized = new Array(seeds.length).fill(false);
    this.availableDustUtxoCounts = new Array(seeds.length).fill(null);

    this.initializationPromise = this.initialize();
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  private async reconnectWallet(walletIndex: number): Promise<void> {
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;
    this.log.log(`Reconnecting wallet ${label}...`);
    this.walletInitialized[walletIndex] = false;
    this.walletResults[walletIndex] = null;
    if (walletIndex === 0) {
      this.config.walletResult = undefined; // Force rebuild instead of using shared
    }
    await this.initializeWallet(walletIndex, this.walletSeeds[walletIndex]);
    this.isInitialized = this.walletInitialized.some(Boolean);
  }

  private async initialize(): Promise<void> {
    try {
      this.log.log(`Initializing Midnight Balancing Adapter (${this.walletSeeds.length} wallet(s))...`);
      setNetworkId(this.walletNetworkId as any);

      this.publicDataProvider = indexerPublicDataProvider(
        this.config.indexer,
        this.config.indexerWS,
      );

      // Initialize all wallets in parallel
      await Promise.all(
        this.walletSeeds.map((seed, i) => this.initializeWallet(i, seed)),
      );

      const readyCount = this.walletInitialized.filter(Boolean).length;
      if (readyCount === 0) {
        throw new Error("All wallets failed to initialize");
      }

      this.isInitialized = true;
      this.log.log(`Adapter ready (${readyCount}/${this.walletSeeds.length} wallets)`);
    } catch (error) {
      this.log.error("Initialization failed:", error);
      throw error;
    }
  }

  private async initializeWallet(index: number, seed: string): Promise<void> {
    const label = `${index + 1}/${this.walletSeeds.length}`;
    try {
      if (index === 0 && this.config.walletResult) {
        this.log.log(`Wallet ${label}: using shared wallet`);
        this.walletResults[index] = await this.config.walletResult;
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
        );
      }

      this.walletAddresses[index] = this.walletResults[index]!
        .zswapSecretKeys.coinPublicKey.toString();

      this.log.log(`Wallet ${label}: built, waiting for funds...`);
      await this.ensureWalletFunds(index);
      this.walletInitialized[index] = true;
      this.log.log(`Wallet ${label}: ready`);
    } catch (error) {
      this.log.error(`Wallet ${label}: initialization failed:`, error);
      // Don't re-throw — let other wallets continue initializing
    }
  }

  private async ensureWalletFunds(walletIndex: number): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    const balances = await syncAndWaitForFunds(walletResult.wallet, {
      timeoutMs: this.walletFundingTimeoutMs,
      waitNonZero: false,
    });

    if (balances.dustBalance === 0n && balances.unshieldedBalance > 0n) {
      this.log.log(`Wallet ${label}: registering NIGHT for dust...`);
      try {
        await registerNightForDust(walletResult);
      } catch (error) {
        this.log.warn(`Wallet ${label}: dust registration failed:`, error);
      }
    }

    const dustBalance = await waitForDustFunds(walletResult.wallet, {
      timeoutMs: this.walletFundingTimeoutMs,
      waitNonZero: true,
    });

    this.log.log(`Wallet ${label}: dust balance: ${dustBalance}`);
    if (dustBalance === 0n) {
      this.log.warn(`Wallet ${label}: WARNING: 0 dust balance, submissions will fail`);
    } else if (this.config.addShieldedPadding) {
      // Shielded padding consumes an extra dust UTXO per tx (1 for balance + 1 for padding).
      // Wallets need at least 2 UTXOs to process any transaction.
      this.log.log(`Wallet ${label}: shielded padding enabled, each tx will consume 2 dust UTXOs`);
    }

    try {
      const dustState = await getInitialDustState(
        // deno-lint-ignore no-explicit-any
        (walletResult.wallet as any).dust,
      );

      const bigintSerializer = (_: string, value: unknown) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      };

      // deno-lint-ignore no-explicit-any
      this.availableDustUtxoCounts[walletIndex] = dustState.availableCoins?.length ?? null;
      this.log.log(`Wallet ${label}: dust coins: ${JSON.stringify(dustState.availableCoins, bigintSerializer)}`);
      this.log.log(`Wallet ${label}: available dust UTXOs: ${this.availableDustUtxoCounts[walletIndex] ?? "unknown"}`);
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
  // Deserialization helpers
  // -----------------------------------------------------------------------

  /**
   * Parse input, handling both plain hex and JSON `{ tx, txStage }` format.
   */
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
      // null/undefined → use system default; true/false → per-input override
      const addShieldedPadding = parsed.addShieldedPadding ?? undefined;
      return { hex, txStage: parsed.txStage, addShieldedPadding };
    }
    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return { hex };
  }

  /**
   * Deserialize one input into a DelegatedTxEntry.
   */
  private deserializeTxEntry(input: DefaultBatcherInput): DelegatedTxEntry {
    const { hex, txStage, addShieldedPadding } = this.parseHexInput(input.input);
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
  // Batch building
  // -----------------------------------------------------------------------

  /**
   * Deserialize inputs into a batch, distributing across wallets round-robin.
   *
   * Each wallet has a per-wallet limit based on config.maxBatchSize and available
   * dust UTXOs. Shielded padding (2 UTXOs/tx vs 1) is determined per-input:
   * the input's `addShieldedPadding` field overrides the config default.
   * Total batch capacity = sum of per-wallet limits.
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<DelegatedBatchData> | null {
    if (inputs.length === 0) return null;

    const txs: DelegatedTxEntry[] = [];
    const selectedInputs: DefaultBatcherInput[] = [];
    const walletAssignments: number[] = [];

    // Identify ready wallets and their capacities.
    // Since per-input addShieldedPadding overrides are possible, we track actual
    // UTXO usage per wallet rather than a fixed utxosPerTx multiplier.
    const readyWallets = this.walletSeeds
      .map((_, i) => i)
      .filter((i) => {
        if (!this.walletInitialized[i] || this.walletResults[i] === null) return false;
        // Wallet needs at least 1 UTXO to handle any tx
        const utxos = this.availableDustUtxoCounts[i];
        if (utxos !== null && utxos < 1) return false;
        return true;
      });

    if (readyWallets.length === 0) return null;

    const perWalletConfigLimit = this.config.maxBatchSize ?? Infinity;
    const walletDustBudgets = new Map<number, number>();
    for (const i of readyWallets) {
      walletDustBudgets.set(i, this.availableDustUtxoCounts[i] ?? Infinity);
    }

    const walletCounts = new Map<number, number>();
    const walletUtxoUsed = new Map<number, number>();
    for (const i of readyWallets) {
      walletCounts.set(i, 0);
      walletUtxoUsed.set(i, 0);
    }

    const defaultPadding = this.config.addShieldedPadding ?? false;
    this.log.log(
      `Limit per wallet: config=${this.config.maxBatchSize}, wallets=${readyWallets.length}, defaultPadding=${defaultPadding}`,
    );
    for (const i of readyWallets) {
      this.log.log(`  wallet ${i + 1}: dust=${this.availableDustUtxoCounts[i]}`);
    }

    // Round-robin assignment respecting per-wallet capacity (count + UTXO budget)
    let rrIndex = this.nextWalletIndex % readyWallets.length;
    for (const input of inputs) {
      // Deserialize first so we know the per-input padding override
      let entry: DelegatedTxEntry;
      try {
        entry = this.deserializeTxEntry(input);
      } catch (error) {
        this.log.error(
          `Deserialize failed for ${input.target}: ${error}`,
        );
        break;
      }

      const usesPadding = entry.addShieldedPadding ?? defaultPadding;
      const utxoCost = usesPadding ? 2 : 1;

      // Find next wallet with remaining capacity
      let walletIdx = -1;
      for (let attempt = 0; attempt < readyWallets.length; attempt++) {
        const candidate = readyWallets[(rrIndex + attempt) % readyWallets.length];
        const count = walletCounts.get(candidate) ?? 0;
        const used = walletUtxoUsed.get(candidate) ?? 0;
        const budget = walletDustBudgets.get(candidate) ?? 0;
        if (count < perWalletConfigLimit && used + utxoCost <= budget) {
          walletIdx = candidate;
          rrIndex = (readyWallets.indexOf(candidate) + 1) % readyWallets.length;
          break;
        }
      }
      if (walletIdx === -1) break; // All wallets at capacity

      try {
        txs.push(entry);
        selectedInputs.push(input);
        walletAssignments.push(walletIdx);
        walletCounts.set(walletIdx, (walletCounts.get(walletIdx) ?? 0) + 1);
        walletUtxoUsed.set(walletIdx, (walletUtxoUsed.get(walletIdx) ?? 0) + utxoCost);
      } catch (error) {
        this.log.error(
          `Deserialize failed for ${input.target}: ${error}`,
        );
        break;
      }
    }

    // Advance round-robin for next batch
    this.nextWalletIndex = rrIndex;

    if (txs.length === 0) return null;

    this.log.log(
      `Built batch of ${txs.length} tx(s) across ${new Set(walletAssignments).size} wallet(s)`,
    );
    return { selectedInputs, data: { txs, selectedInputs, walletAssignments } };
  }

  // -----------------------------------------------------------------------
  // Core pipeline helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve whether shielded padding should be applied for a given entry.
   * Per-input override (true/false) takes precedence; undefined falls back to config.
   */
  private shouldAddShieldedPadding(entry: DelegatedTxEntry): boolean {
    return entry.addShieldedPadding ?? this.config.addShieldedPadding ?? false;
  }

  /**
   * Balance a single entry against a specific wallet's dust.
   *
   * Each call speculatively marks consumed dust UTXOs as pending via
   * `CoreWallet.spendCoins` / `pendingDustTokens`, so the next call in the
   * same wallet automatically picks different UTXOs — no on-chain confirmation
   * needed between calls.
   */
  private async balanceEntry(
    entry: DelegatedTxEntry,
    walletIndex: number,
  ): Promise<BalancingRecipe> {
    const walletResult = this.walletResults[walletIndex]!;

    // Ensure dust wallet has up-to-date state (including generationInfo for coins)
    // before attempting to balance. Without this, balanceTransactions may read stale
    // state where generationInfo hasn't been populated, causing "No dust found".
    // deno-lint-ignore no-explicit-any
    await (walletResult.wallet as any).dust.waitForSyncedState();

    const keys = {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    const opts = { ttl: createTtl() };

    // Apply shielded padding BEFORE dust balancing so the balance call accounts
    // for the full padded transaction size (including padding proof costs).
    // Only applicable for unproven transactions, which can be merged with the
    // self-transfer before balance. payFees: false ensures the self-transfer
    // brings no dust of its own — the subsequent balance call covers everything.
    if (this.shouldAddShieldedPadding(entry) && entry.txStage === "unproven") {
      try {
        const paddedTx = await this.applyShieldedPadding(entry.tx as UnprovenTransaction, true, walletIndex);
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
        if (this.shouldAddShieldedPadding(entry) && recipe.balancingTransaction) {
          try {
            recipe.balancingTransaction = await this.applyShieldedPadding(recipe.balancingTransaction, true, walletIndex);
          } catch (e) {
            this.log.warn(
              "Shielded padding unavailable, submitting without padding. " +
              `Ensure the batcher wallet has shielded NIGHT tokens. ${e}`,
            );
          }
        }
        break;
      case "finalized":
        recipe = await walletResult.wallet.balanceFinalizedTransaction(
          entry.tx as FinalizedTransaction,
          keys,
          opts,
        );
        if (this.shouldAddShieldedPadding(entry) && recipe.balancingTransaction) {
          try {
            recipe.balancingTransaction = await this.applyShieldedPadding(recipe.balancingTransaction, true, walletIndex);
          } catch (e) {
            this.log.warn(
              "Shielded padding unavailable, submitting without padding. " +
              `Ensure the batcher wallet has shielded NIGHT tokens. ${e}`,
            );
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

  /**
   * Merges a shielded NIGHT self-transfer into the balancing transaction.
   * The transfer is zero-sum (spend 1 unit, receive 1 unit back to self),
   * so it adds no token imbalance. After proveTx, the INPUT_PROOF_SIZE +
   * OUTPUT_PROOF_SIZE bytes appear in the finalized transaction's est_size().
   *
   * **Why this exists (temporary workaround):**
   * When a Compact circuit is complex, the node's estimated proof-verification
   * time (`cost_to_dismiss`) can exceed the allowed proving window
   * (`time_to_dismiss`), causing `OutsideTimeToDismiss` rejection.
   *
   * `time_to_dismiss` is derived from `est_size()`:
   *   time_to_dismiss = max(time_to_dismiss_per_byte * est_size, min_time_to_dismiss)
   *   (default: 2 microseconds/byte, 15 ms floor)
   *
   * The ledger's `est_size()` (ledger/src/structure.rs) counts each shielded
   * transient coin as BOTH an input and an output:
   *   +4,832 bytes (INPUT_PROOF_SIZE) + 4,832 bytes (OUTPUT_PROOF_SIZE) = +9,664 bytes
   * With `payFees: true`, an additional dust spend adds +2,912 bytes (DUST_SPEND_PROOF_SIZE).
   *
   * Net effect per self-transfer: ~+19.3 ms (or ~+25.1 ms with dust) added to
   * the proving window, while the actual validation cost increase is much smaller.
   * This exploits the conservative nature of `estimated_tx_size` to create
   * headroom for complex circuit proofs.
   *
   * See: midnight-ledger ledger/src/structure.rs (estimated_tx_size, cost)
   */
  private async applyShieldedPadding(
    balancingTx: UnprovenTransaction,
    payFees: boolean,
    walletIndex: number,
  ): Promise<UnprovenTransaction> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) throw new Error("Wallet not initialized");

    this.log.log("[balancing] Adding shielded padding...");
    const keys = walletResult.walletZswapSecretKeys;

    // Get the shielded address as a ShieldedAddress object (required by transferTransaction)
    // deno-lint-ignore no-explicit-any
    const initialState = await getInitialShieldedState((walletResult.wallet as any).shielded);
    const receiverAddress = initialState.address;
    if (!this.config.shieldedPaddingTokenID) {
      throw new Error("shieldedPaddingTokenID must be set when addShieldedPadding is true");
    }
    const type = this.config.shieldedPaddingTokenID;
    // Build a self-transfer: send 1 unit of shielded NIGHT back to ourselves.
    // payFees: false — dust fees are already in the balancingTx.
    const outputs: ShieldedTokenTransfer[] =  [
      {
        type: "shielded",
        outputs: [{
          type,
          receiverAddress,
          amount: 1n
        }]
      }
    ];
    const conf  = {
      shieldedSecretKeys: keys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    const opt = {
      ttl: createTtl(),
      payFees: payFees,
    }
    const paddingRecipe = await walletResult.wallet.transferTransaction(outputs, conf, opt);

    // Merge: dust fee inputs stay, shielded input+output are added.
    // Both are UnprovenTransaction so merge is type-safe.
    return balancingTx.merge(paddingRecipe.transaction);
  }

  /**
   * Phase 1 helper: balance all txs assigned to a single wallet, sequentially.
   * Speculative chaining within one wallet requires sequential balancing so each
   * call sees the prior call's pending dust state.
   */
  private async balanceWalletGroup(
    walletIndex: number,
    indices: number[],
    pipeline: TxPipelineEntry[],
  ): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;

    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
      const p = pipeline[i];
      const label = `${i + 1}/${pipeline.length} (wallet ${walletIndex + 1})`;
      try {
        this.log.log(`Phase 1 — balance tx ${label} (${p.entry.txStage})`);
        p.recipe = await this.balanceEntry(p.entry, walletIndex);

        // Log the dust fee for this transaction.
        const feeTx =
          "balancingTransaction" in p.recipe && p.recipe.balancingTransaction
            ? p.recipe.balancingTransaction
            : "transaction" in p.recipe
              ? p.recipe.transaction
              : null;
        if (feeTx) {
          try {
            const fee = await walletResult.wallet.calculateTransactionFee(feeTx);
            this.log.log(`Phase 1 — tx ${label} dust fee: ${fee} SPECKs`);
          } catch {
            // non-critical — skip if fee calculation fails
          }
        }
      } catch (error) {
        p.error = error instanceof Error ? error : new Error(String(error));
        this.log.log(`Balance failed for tx ${label}: ${p.error.message}`);
        // Skip remaining txs in THIS wallet's group only — other wallets continue.
        for (let k = j + 1; k < indices.length; k++) {
          pipeline[indices[k]].error = new Error(
            `Skipped: prior tx ${label} failed to balance`,
          );
        }
        break;
      }
    }
  }

  /**
   * Phase 2 helper: sign and finalize all txs assigned to a single wallet,
   * sequentially. Uses `finalizeRecipe` which handles all three recipe types.
   */
  private async finalizeWalletGroup(
    walletIndex: number,
    indices: number[],
    pipeline: TxPipelineEntry[],
  ): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;

    for (const i of indices) {
      const p = pipeline[i];
      if (p.error || !p.recipe) continue;

      const label = `${i + 1}/${pipeline.length} (wallet ${walletIndex + 1})`;
      try {
        this.log.log(`Phase 2 — finalize tx ${label}`);

        const signedRecipe = await walletResult.wallet.signRecipe(
          p.recipe,
          (payload: Uint8Array) =>
            walletResult.unshieldedKeystore.signData(payload),
        );

        p.finalized = await walletResult.wallet.finalizeRecipe(signedRecipe);
      } catch (error) {
        p.error = error instanceof Error ? error : new Error(String(error));
        this.log.log(`Finalize failed for tx ${label}: ${p.error.message}`);
        // Don't cascade — later txs may still finalize independently.
      }
    }
  }

  // -----------------------------------------------------------------------
  // Submit batch
  // -----------------------------------------------------------------------

  /**
   * Three-phase pipeline: balance -> finalize -> submit.
   *
   * Phases 1 and 2 run in parallel across wallets (sequential within each
   * wallet for speculative chaining correctness). Phase 3 submits all txs
   * in staggered order regardless of wallet.
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

    const { txs, walletAssignments } = batchData;
    const pipeline: TxPipelineEntry[] = txs.map((entry, i) => ({
      entry,
      walletIndex: walletAssignments[i],
    }));

    this.log.log(
      `Processing batch of ${txs.length} tx(s) across ${new Set(walletAssignments).size} wallet(s)`,
    );

    // Group pipeline entries by wallet
    const walletGroups = new Map<number, number[]>();
    for (let i = 0; i < pipeline.length; i++) {
      const wi = pipeline[i].walletIndex;
      if (!walletGroups.has(wi)) walletGroups.set(wi, []);
      walletGroups.get(wi)!.push(i);
    }

    // --- Phase 1: Balance — parallel across wallets, sequential within ---
    await Promise.all(
      [...walletGroups.entries()].map(([walletIdx, indices]) =>
        this.balanceWalletGroup(walletIdx, indices, pipeline),
      ),
    );

    // --- Phase 2: Sign and finalize — parallel across wallets, sequential within ---
    await Promise.all(
      [...walletGroups.entries()].map(([walletIdx, indices]) =>
        this.finalizeWalletGroup(walletIdx, indices, pipeline),
      ),
    );

    // --- Phase 3: Submit staggered ---
    let hasDroppedFirst = false;
    const submitPromises: Promise<void>[] = [];

    for (let i = 0; i < pipeline.length; i++) {
      const p = pipeline[i];
      if (p.error || !p.finalized) continue;

      const walletResult = this.walletResults[p.walletIndex];
      if (!walletResult) {
        p.error = new Error(`Wallet ${p.walletIndex + 1} not available for submit`);
        continue;
      }

      const label = `${i + 1}/${pipeline.length}`;
      let txHashStr = "";

      this.log.log(`Submitting tx ${label} (wallet ${p.walletIndex + 1}) to node...`);

      txHashStr = p.finalized.transactionHash().toString();
      p.hash = txHashStr;

      const submitPromise = Promise.race([
        walletResult.wallet.submitTransaction(p.finalized),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("submitTransaction timed out after 60 seconds"),
              ),
            SUBMIT_TX_TIMEOUT_MS,
          )
        ),
      ])
        .then((data) => {
          this.log.log(`Submission data: ${JSON.stringify(data)}`);
          this.log.log(`Submission successful for tx ${label}`);
          this.log.log(`Submitted tx ${label}: ${p.hash}`);
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
              this.log.log(
                `Submit failed for tx ${label} due to expected dropped error. Marking as dropped to remove from queue (first in batch).`,
              );
              p.hash = "dropped_" + (txHashStr || Date.now() + "_" + i);
              p.error = undefined;
              hasDroppedFirst = true;
            } else {
              this.log.log(
                `Submit failed for tx ${label} with dropped error, but keeping in queue since a prior tx was already dropped.`,
              );
              p.error = err;
              p.hash = undefined;
            }
          } else if (errMsg.includes("IntentAlreadyExists")) {
            // The transaction is already in the mempool (submitted in a prior attempt whose
            // response was lost). Treat as success so the input is removed from the queue
            // and receipt polling proceeds with the hash we already computed.
            this.log.log(
              `Submit for tx ${label} got IntentAlreadyExists — tx already in mempool, treating as success.`,
            );
            p.error = undefined;
            // p.hash is already set to txHashStr above
          } else if (
            errMsg === "Transaction submission error: Transaction submission failed" ||
            errMsg === "Transaction submission failed" ||
            errMsg.includes("Invalid Transaction")
          ) {
            this.log.log(
              `Submit failed for tx ${label} due to unprocessable error. Marking as dropped to remove from queue.`,
            );
            p.hash = "dropped_" + (txHashStr || Date.now() + "_" + i);
            p.error = undefined;
          } else {
            p.error = err;
            p.hash = undefined; // clear hash if it failed
            this.log.log(
              `Submit failed for tx ${label}: ${p.error.message}`,
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

    this.log.log(
      `Batch results: ${succeeded.length} succeeded, ${failed.length} failed`,
    );

    if (failed.length > 0) {
      this.log.warn(
        `Batch: ${succeeded.length} succeeded, ${failed.length} failed`,
      );
      for (const p of failed) {
        this.log.warn(`  - ${p.entry.txStage}: ${p.error!.message}`);
      }

      // Remove failed inputs from selectedInputs so the batcher doesn't mark them as processed
      for (let i = pipeline.length - 1; i >= 0; i--) {
        if (pipeline[i].error != null) {
          this.log.log(
            `Removing failed input at index ${i} from selectedInputs`,
          );
          batchData.selectedInputs.splice(i, 1);
        }
      }
    }

    if (succeeded.length === 0) {
      this.log.log(`All transactions failed`);
      const firstErrorMsg = pipeline[0].error?.message ?? "unknown";

      if (firstErrorMsg.includes("No dust tokens found in the wallet state")) {
        this.log.log(
          `Wallet entered bad state. Triggering reconnect for affected wallets...`,
        );
        const affectedWallets = new Set(pipeline.map((p) => p.walletIndex));
        for (const wi of affectedWallets) {
          try {
            await this.reconnectWallet(wi);
          } catch (reconnectError) {
            this.log.log(`Reconnect wallet ${wi + 1} failed: ${reconnectError}`);
          }
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
    this.log.log(`Returning hashes: ${finalHashes}`);
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

    this.log.log(
      `waitForTransactionReceipt called with hashes: ${hash}, effective timeout: ${effectiveTimeout}`,
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
      this.log.log(`Skipping receipt wait for dropped tx: ${hash}`);
      return {
        hash,
        blockNumber: 0n,
        status: 0,
      };
    }

    this.log.log(
      `Waiting for receipt for ${hash} (timeout: ${timeout}ms)...`,
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
          body: JSON.stringify({
            query,
            variables: { hash: normalizedHash },
          }),
          headers: { "Content-Type": "application/json" },
        });

        const body = await response.json();

        // Log the raw response if it's not what we expect
        if (!body || !body.data || !body.data.transactions) {
          this.log.log(
            `Unexpected indexer response for ${hash}: ${
              JSON.stringify(body)
            }`,
          );
        }

        const tx = body.data?.transactions?.[0];

        if (tx?.block) {
          this.log.log(
            `Found receipt for ${hash} at block ${tx.block.height}`,
          );
          return {
            hash,
            blockNumber: BigInt(tx.block.height),
            status: 1,
          };
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
