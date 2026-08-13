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
  Transaction as LedgerTransaction,
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
} from "@midnightntwrk/wallet-sdk-facade";
import {
  getInitialDustState,
  getInitialShieldedState,
  type NetworkUrls,
  registerNightForDust,
  resolveFacadeDustBalance,
  suspendAuxWalletSyncForFees,
  waitForDustFunds,
  waitForDustFundsWithRetry,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import * as Rx from "rxjs";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { NetworkId as WalletNetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { AdapterLogger } from "./adapter-logger.ts";
import { WorkerPool } from "./worker-pool.ts";
import {
  contractActions,
  evaluateDeclarativePolicy,
  evaluatePolicy,
  isPolicyEnforced,
  type MidnightTxPolicy,
  type PolicyInspectableTx,
} from "./midnight-policy.ts";
import {
  admissionWeight,
  checkShapeLimits,
  DEFAULT_SHAPE_LIMITS,
  type ShapeLimits,
} from "./shape-limits.ts";

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
  // How long to wait for a spendable dust coin before letting the balance
  // attempt proceed (and likely fail + re-queue). Defaults to 60s.
  dustWaitTimeoutMs?: number;
  // A dust coin only counts as spendable when its GENERATED value covers the
  // wallet's fee + per-coin overhead margin. Defaults to 1.5 × the 0.3 DUST
  // overhead (coins exist with ~0 generated value right after creation — a
  // bare `availableCoins.length > 0` check passes while balancing is doomed).
  minSpendableDustPerCoin?: bigint;
  // Reject inputs whose serialized payload exceeds this many characters at
  // intake (pre-queue). Defaults to 500k chars (~250 KB of tx bytes) — well
  // above any legitimate balanced+padded tx, well below abuse territory.
  maxInputChars?: number;
  /**
   * Content-based authorization for this target (multi-product batchers).
   * Declares WHICH transactions this product may submit — pure transfers,
   * calls to allowlisted contracts/circuits — plus an optional custom final
   * filter. Omit for allow-all (single-product / back-compatible behavior).
   *
   * Enforced at intake (validateInput → 400) and re-checked pre-batch
   * (storage rows are untrusted and policy can change across a restart).
   * See `./midnight-policy.ts` for the helpers custom filters should use.
   */
  policy?: MidnightTxPolicy<DelegatedTx>;
  /**
   * Structural ceilings on a submitted transaction. Bounds the verification
   * WORK a caller can ask for, which `maxInputChars` cannot: a 46-output and a
   * 1-output transfer both fit under the size cap while costing ~2.21 s and
   * ~128 ms of unconditional zswap proof verification.
   *
   * Defaults to {@link DEFAULT_SHAPE_LIMITS} rather than "off", because a
   * ceiling that only protects operators who already knew to set it is not
   * protecting the people it is for. Raise it per product if a legitimate
   * workload needs more; pass `{}` to disable enforcement deliberately.
   */
  shapeLimits?: ShapeLimits;
  /**
   * Log label for this adapter instance, e.g. the product name. Defaults to
   * "balancing". In a multi-product process this is what makes each product's
   * lines distinguishable: `[balancing:product-a] …`.
   */
  logLabel?: string;
}

const TTL_DURATION_MS = 60 * 60 * 1000;
const SUBMIT_TX_TIMEOUT_MS = 90 * 1000;
const SPECKS_PER_DUST = 1_000_000_000_000_000n; // 1 DUST = 10^15 Specks
const DUST_REGISTRATION_PRECHECK_TIMEOUT_MS = 60_000;
// Wallet-side per-coin fee margin (additionalFeeOverhead) is 0.3 DUST; a coin
// below that generated value cannot be selected by the SDK's balancer.
const DUST_FEE_OVERHEAD_SPECKS = 300_000_000_000_000n;
const DEFAULT_MIN_SPENDABLE_DUST = (DUST_FEE_OVERHEAD_SPECKS * 3n) / 2n;
const DEFAULT_MAX_INPUT_CHARS = 500_000;
/** Throttle for background dust-state refreshes triggered by capacity checks. */
const DUST_REFRESH_THROTTLE_MS = 5_000;
const createTtl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

function formatDust(specks: bigint): string {
  const abs = specks < 0n ? -specks : specks;
  const sign = specks < 0n ? "-" : "";
  const whole = abs / SPECKS_PER_DUST;
  const frac = abs % SPECKS_PER_DUST;
  const fracStr = frac.toString().padStart(15, "0").replace(/0+$/, "");
  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

// ---------------------------------------------------------------------------
// Wallet-seed registry (process-wide)
// ---------------------------------------------------------------------------

/**
 * Seeds already claimed by a live adapter in this process, seed → owner label.
 *
 * Sharing a seed across two adapter instances is never safe: each instance
 * builds its own WalletFacade with its own `pendingDust` ledger and its own
 * per-wallet balance mutex, so both would select the same on-chain dust coins
 * (double-spend attempts, "could not balance dust", coins stranded until the
 * grace period). One wallet belongs to exactly one adapter.
 */
/**
 * Opaque proof of a seed claim. Only `claimWalletSeeds` mints one, and release
 * compares by object identity — so a claim cannot be forged by reconstructing a
 * value that "looks like" it, and one adapter cannot drop another's claim.
 */
export type WalletSeedClaim = { readonly __walletSeedClaim: unique symbol };

const claimedWalletSeeds = new Map<string, { owner: string; token: object }>();

/**
 * Wallets claimed by INSTANCE IDENTITY, not by seed.
 *
 * `config.walletResult` hands the adapter an already-built wallet and skips the
 * seed path entirely. Two adapters can therefore declare distinct nominal
 * seeds, both satisfy the seed registry, and then operate the same wallet —
 * which is precisely the double-spend the seed registry exists to prevent,
 * arrived at through the one door it does not watch.
 *
 * Seeds identify wallets the adapter builds; this identifies the ones it is
 * handed. A WeakMap so a discarded wallet does not pin its owner label.
 */
const claimedWalletInstances = new WeakMap<object, string>();

/** The object that identifies a wallet: the facade itself, else the result. */
function walletIdentity(walletResult: unknown): object | null {
  const target = (walletResult as { wallet?: unknown } | null)?.wallet ??
    walletResult;
  return target !== null &&
      (typeof target === "object" || typeof target === "function")
    ? target as object
    : null;
}

/**
 * Claim a resolved wallet instance. Returns the key to release later, or null
 * when the value carries no usable identity (nothing to guard).
 */
export function claimWalletInstance(walletResult: unknown, owner: string): object | null {
  const key = walletIdentity(walletResult);
  if (!key) return null;
  const existing = claimedWalletInstances.get(key);
  if (existing !== undefined) {
    throw new Error(
      `MidnightBalancingAdapter (${owner}): this wallet instance is already in ` +
        `use by "${existing}". Handing one walletResult to two adapters gives ` +
        `them independent pendingDust ledgers over the same coins — the same ` +
        `double-spend the seed registry prevents, reached through the path it ` +
        `does not watch. Build a separate wallet for each product.`,
    );
  }
  claimedWalletInstances.set(key, owner);
  return key;
}

/**
 * Claim wallet seeds for one adapter instance. Throws if any seed is already
 * claimed (or listed twice). Exported so the exclusivity contract can be
 * tested without starting wallet sync.
 */
/**
 * Canonical identity of a seed: what the wallet actually derives from.
 *
 * The wallet does `Buffer.from(seed, "hex")`, so "AA…" and "aa…" (and an
 * 0x-prefixed spelling) are the SAME wallet. Keying the registry on the raw
 * string would let two adapters claim one wallet by spelling it differently —
 * defeating the exclusivity check exactly when it is needed, since an operator
 * copying seeds between config files is how the collision arises in the first
 * place.
 */
function canonicalSeed(seed: string, owner: string): string {
  const raw = typeof seed === "string" ? seed.trim() : "";
  const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `MidnightBalancingAdapter (${owner}): wallet seed is not valid hex ` +
        `(got ${hex.length} character(s)). The wallet derives from ` +
        `Buffer.from(seed, "hex"), so a malformed seed silently becomes a ` +
        `different wallet than intended.`,
    );
  }
  return hex.toLowerCase();
}

export function claimWalletSeeds(seeds: string[], label?: string): WalletSeedClaim {
  const owner = label ?? "unlabeled adapter";
  const seen = new Set<string>();
  const canonical: string[] = [];
  // Validate the whole list before mutating, so a partial claim cannot leak on
  // the throw path.
  for (const seed of seeds) {
    const key = canonicalSeed(seed, owner);
    if (seen.has(key)) {
      throw new Error(
        `MidnightBalancingAdapter (${owner}): wallet seed listed twice in the same adapter`,
      );
    }
    seen.add(key);
    canonical.push(key);
    const existing = claimedWalletSeeds.get(key)?.owner;
    if (existing !== undefined) {
      throw new Error(
        `MidnightBalancingAdapter (${owner}): wallet seed already in use by "${existing}". ` +
          `Each adapter instance needs its OWN wallet — sharing one causes double-spent dust. ` +
          `Give this product a distinct seed. (Seeds are compared by their derived ` +
          `bytes, so differing case or an 0x prefix is still the same wallet.)`,
      );
    }
  }
  const token = Object.freeze({}) as unknown as WalletSeedClaim;
  for (const key of canonical) claimedWalletSeeds.set(key, { owner, token });
  return token;
}

/**
 * Release seed claims held by `owner`. Ownership-checked: releasing is how an
 * adapter gives up its wallet on shutdown, and one adapter must not be able to
 * drop another's claim and re-open the double-spend window.
 */
export function releaseWalletSeeds(claim: WalletSeedClaim | undefined): void {
  if (!claim) return;
  for (const [key, held] of [...claimedWalletSeeds.entries()]) {
    if (held.token === claim) claimedWalletSeeds.delete(key);
  }
}

/**
 * Drop every seed claim.
 *
 * @internal TEST HELPER ONLY. Calling this while adapters are live silently
 * disables the double-spend protection for all of them.
 */
export function resetWalletSeedRegistry(): void {
  claimedWalletSeeds.clear();
}

/**
 * Reject a policy object that cannot authorize anything.
 *
 * `undefined` means "no policy" and stays allow-all — that is the backward
 * compatible path for single-product batchers. But a policy the operator wrote
 * out and that grants nothing is a mistake, not a preference, and treating it
 * as allow-all turns a typo into an open gate. `allowedTokenTypes` is the
 * likeliest form: it only narrows the transfer rule, so on its own it grants
 * nothing and silently authorizes everything.
 */
export function assertPolicyIsEffective(
  policy: MidnightTxPolicy<never> | undefined,
  label?: string,
): void {
  if (policy === undefined) return;
  if (isPolicyEnforced(policy)) return;
  const who = `MidnightBalancingAdapter (${label ?? "unlabeled adapter"})`;
  const hasOnlyTokenTypes = (policy.allowedTokenTypes?.length ?? 0) > 0;
  throw new Error(
    `${who}: \`policy\` was provided but authorizes nothing, which would ` +
      `behave as allow-all.` +
      (hasOnlyTokenTypes
        ? ` \`allowedTokenTypes\` only narrows the transfer rule — pair it with ` +
          `\`allowZswapTransfers: true\`.`
        : ` Set at least one of allowZswapTransfers / allowedContracts / ` +
          `allowedCircuits / allowCustomFinalFilter.`) +
      ` Omit \`policy\` entirely if this product really should accept anything.`,
  );
}

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
  /** The originating input — needed by the pre-spend policy gate. */
  input: DefaultBatcherInput;
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
  /** Inputs whose payload failed to deserialize. They are included in
   *  selectedInputs (reserved) and spliced out at submit time so the
   *  processor's failure path increments their retry counts — a poison input
   *  is retried a bounded number of times and then dropped WITH a log,
   *  instead of being skipped-but-kept forever. */
  invalidInputs: DefaultBatcherInput[];
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
  private readonly log: AdapterLogger;

  private walletResults: (WalletResult | null)[];
  private walletAddresses: (string | null)[];
  private walletInitialized: boolean[];
  /**
   * Wallet-instance claims this adapter holds. Only keys it claimed itself land
   * here, so releasing from this list cannot drop another adapter's claim even
   * if two adapters share a log label.
   */
  private claimedWalletKeys: object[] = [];
  /** Proof of this adapter's seed claim; the only thing that can release it. */
  private readonly seedClaim: WalletSeedClaim;
  /**
   * True where the wallet was handed in via `config.walletResult`. An injected
   * wallet belongs to the caller: this adapter must not stop it on close.
   */
  private walletIsInjected: boolean[];
  private availableDustUtxoCounts: (number | null)[];
  /** Tracks wallets that recently failed due to missing dust. Cleared when dust is confirmed available. */
  private walletDustExhausted: boolean[];
  /** Timestamp of the last background dust-state refresh (throttling). */
  private lastDustRefreshAt = 0;
  /** True while a background dust refresh is in flight. */
  private dustRefreshInFlight = false;

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
    // A policy object that authorizes nothing is almost certainly a config
    // mistake, and today it behaves as allow-all — the operator believes work
    // is gated when it is not. Absent policy stays allow-all for backward
    // compatibility; an explicit one has to actually say something.
    assertPolicyIsEffective(
      config.policy as MidnightTxPolicy<never> | undefined,
      config.logLabel,
    );
    // Two adapter instances sharing a seed each build their OWN WalletFacade,
    // with independent local dust booking and independent balance mutexes —
    // they would select the same on-chain dust coins and double-spend. Fail
    // loudly at construction instead of at 3am.
    this.seedClaim = claimWalletSeeds(seeds, config.logLabel);
    this.walletSeeds = seeds;
    this.config = config;
    this.log = new AdapterLogger(
      config.logLabel ? `balancing:${config.logLabel}` : "balancing",
    );
    this.walletNetworkId = config.walletNetworkId ??
      ("undeployed" as WalletNetworkId.NetworkId);
    this.walletFundingTimeoutMs = (config.walletFundingTimeoutSeconds ?? 600) *
      1000;
    this.syncProtocolName = config.syncProtocolName ??
      `Midnight-Balancing (${this.walletNetworkId})`;

    this.walletResults = new Array(seeds.length).fill(null);
    this.walletAddresses = new Array(seeds.length).fill(null);
    this.walletIsInjected = new Array(seeds.length).fill(false);
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
        this.log.log(`Wallet ${label}: using shared wallet...`);
        this.walletResults[index] = await this.config.walletResult;
        this.walletIsInjected[index] = true;
        // The seed registry never saw this wallet — it was handed in, not
        // derived. Claim it by identity or two adapters with different nominal
        // seeds end up on the same coins.
        this.claimWallet(this.walletResults[index]);

        this.log.log(`Wallet ${label}: waiting for funds...`);
        await this.ensureWalletFunds(index);

        await suspendAuxWalletSyncForFees(this.walletResults[index]!.wallet);
      } else {
        this.log.log(`Wallet ${label}: building with retry-aware dust sync...`);
        const networkUrls: Required<NetworkUrls> = {
          id: this.walletNetworkId,
          indexer: this.config.indexer,
          indexerWS: this.config.indexerWS,
          node: this.config.node,
          proofServer: this.config.proofServer,
        };

        // Use waitForDustFundsWithRetry: builds wallet, restores cached state,
        // syncs with stall detection + retry, saves state to disk
        const { walletResult, dustBalance } = await waitForDustFundsWithRetry({
          networkUrls,
          seed,
          networkId: this.walletNetworkId,
          syncMode: 'dust-only',
          balanceWaitTimeoutMs: this.walletFundingTimeoutMs,
        });

        this.walletResults[index] = walletResult;
        // Also claimed, even though the seed registry already covers this path:
        // a builder that ever returns a cached or shared instance would
        // otherwise reintroduce the same aliasing silently.
        this.claimWallet(walletResult);

        if (dustBalance > 0n) {
          this.log.log(`Wallet ${label}: dust balance: ${dustBalance}`);
        } else {
          this.log.warn(
            `Wallet ${label}: dust balance still 0 — wallet needs dust or unshielded NIGHT to register`,
          );
        }

        // Set up UTXO counts and worker pool slots
        await this.updateWorkerPoolForWallet(index);
      }

      const wr = this.walletResults[index]!;
      this.walletAddresses[index] = wr.zswapSecretKeys.coinPublicKey.toString();
      this.log.log(`Wallet ${label} addresses:`);
      this.log.log(`  shielded:   ${this.walletAddresses[index]}`);
      this.log.log(`  unshielded: ${wr.unshieldedAddress}`);
      this.log.log(`  dust:       ${wr.dustAddress}`);

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

    let dustBalance = 0n;
    try {
      dustBalance = await waitForDustFunds(walletResult.wallet, {
        timeoutMs: this.walletFundingTimeoutMs,
        waitNonZero: true,
      });
    } catch {
      /* no dust within timeout */
    }

    if (dustBalance === 0n) {
      this.log.log(`Wallet ${label}: no dust yet, trying unshielded→dust registration...`);
      try {
        if (await registerNightForDust(walletResult)) {
          dustBalance = await waitForDustFunds(walletResult.wallet, {
            timeoutMs: this.walletFundingTimeoutMs,
            waitNonZero: true,
          });
        }
      } catch (error) {
        this.log.warn(`Wallet ${label}: dust registration failed:`, error);
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

  /**
   * Read dust UTXO count and update worker pool slots for a wallet.
   * Extracted so it can be called independently from ensureWalletFunds.
   */
  private async updateWorkerPoolForWallet(walletIndex: number): Promise<void> {
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    try {
      const dustState = await getInitialDustState(
        // deno-lint-ignore no-explicit-any
        (walletResult.wallet as any).dust,
      );

      const bigintSerializer = (_: string, value: unknown) => {
        if (typeof value === "bigint") return value.toString();
        return value;
      };

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

  private async getDustBalance(walletIndex: number): Promise<bigint> {
    const wr = this.walletResults[walletIndex];
    if (!wr) return 0n;
    try {
      const dustState = await getInitialDustState(
        wr.wallet.dust as { state: Rx.Observable<unknown> },
        { timeoutMs: 30_000 },
      );
      return resolveFacadeDustBalance(dustState);
    } catch {
      return 0n;
    }
  }

  /**
   * Read the dust state and update the cached UTXO count + exhausted flag.
   * Called in the background after each balance so the next tx's fast path
   * reflects current chain state. Errors are swallowed — if the read fails,
   * the slow path will refresh on the next call.
   */
  private async refreshUtxoCountAfterBalance(walletIndex: number): Promise<void> {
    const wr = this.walletResults[walletIndex];
    if (!wr) return;
    try {
      // deno-lint-ignore no-explicit-any
      const dustState = await getInitialDustState((wr.wallet as any).dust);
      const count = dustState.availableCoins?.length ?? 0;
      this.availableDustUtxoCounts[walletIndex] = count;
      this.walletDustExhausted[walletIndex] = count === 0;
    } catch {
      // ignore — next slow-path call will re-sync
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
    if (!this.pool.hasAvailableWorker()) return false;
    // Dust-aware gate: when every initialized wallet is known to be out of
    // spendable dust, report no capacity so the poll loop SKIPS the target —
    // inputs stay queued (no retry burn, no doomed 60s waits). A throttled
    // background refresh flips the flags back as coins regain value.
    const allExhausted = this.walletInitialized.every(
      (ok, i) => !ok || this.walletDustExhausted[i],
    );
    if (allExhausted) {
      this.maybeRefreshDustState();
      return false;
    }
    return true;
  }

  /** Throttled background re-read of every wallet's dust state. */
  private maybeRefreshDustState(): void {
    const now = Date.now();
    if (this.dustRefreshInFlight || now - this.lastDustRefreshAt < DUST_REFRESH_THROTTLE_MS) {
      return;
    }
    this.dustRefreshInFlight = true;
    this.lastDustRefreshAt = now;
    void (async () => {
      try {
        for (let i = 0; i < this.walletSeeds.length; i++) {
          if (!this.walletInitialized[i]) continue;
          const info = await this.getSpendableDustInfo(i);
          const wasExhausted = this.walletDustExhausted[i];
          this.availableDustUtxoCounts[i] = info.total;
          this.walletDustExhausted[i] = info.spendable === 0;
          if (wasExhausted && info.spendable > 0) {
            this.log.log(
              `Wallet ${i + 1}/${this.walletSeeds.length}: dust recovered ` +
                `(${info.spendable}/${info.total} spendable coins) — resuming`,
            );
          }
        }
      } catch {
        // ignore — next capacity check retries
      } finally {
        this.dustRefreshInFlight = false;
      }
    })();
  }

  /**
   * Count dust coins whose GENERATED value can actually pay a fee. The SDK's
   * balancer selects coins by value ≥ fee + overhead margin; a freshly created
   * coin exists with ~0 generated value, so a bare count is NOT a readiness
   * signal (grand-e2e root cause: gate passed on count, balance failed on value).
   */
  private async getSpendableDustInfo(
    walletIndex: number,
  ): Promise<{ total: number; spendable: number; values: bigint[] }> {
    const wr = this.walletResults[walletIndex];
    if (!wr) return { total: 0, spendable: 0, values: [] };
    const minValue = this.config.minSpendableDustPerCoin ?? DEFAULT_MIN_SPENDABLE_DUST;
    const dustState = await getInitialDustState(
      wr.wallet.dust as { state: Rx.Observable<unknown> },
      { timeoutMs: 30_000 },
    );
    const coins = (dustState as { availableCoins?: Array<{ generatedNow?: bigint | string }> })
      .availableCoins ?? [];
    const values = coins.map((c) => BigInt(c.generatedNow ?? 0));
    return {
      total: coins.length,
      spendable: values.filter((v) => v >= minValue).length,
      values,
    };
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
        tx: LedgerTransaction.deserialize(
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
        tx: LedgerTransaction.deserialize(
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
        tx: LedgerTransaction.deserialize(
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
        tx: LedgerTransaction.deserialize(
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
        tx: LedgerTransaction.deserialize(
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
    const invalidInputs: DefaultBatcherInput[] = [];

    // Only assign workers from wallets known to have spendable dust.
    // (No fallback to exhausted wallets — hasAvailableCapacity() gates the
    // all-exhausted case, so inputs simply stay queued until dust recovers.)
    const dustFilter = (walletIdx: number): boolean =>
      !this.walletDustExhausted[walletIdx];

    for (const input of availableInputs) {
      // Deserialize BEFORE acquiring a worker. Failures are selected as
      // invalid (no worker) so the processor increments their retries and
      // eventually drops them with a log — never skipped-but-kept forever.
      let entry: DelegatedTxEntry;
      try {
        entry = this.deserializeTxEntry(input);
      } catch (error) {
        this.log.warn(
          `Deserialize failed for #${inputContentHash(input.input)} ` +
            `(retry=${input.retryCount ?? 0}) — marking failed: ${error}`,
        );
        invalidInputs.push(input);
        selectedInputs.push(input);
        continue;
      }

      // Defense in depth: re-check the declarative rules against the stored
      // row. Catches on-disk tampering and policy tightened across a restart.
      // (The custom filter half runs in processWorkerTx — it may be async.)
      const verdict = this.declarativePolicyVerdict(entry);
      if (!verdict.valid) {
        this.log.warn(
          `Policy rejected #${inputContentHash(input.input)} pre-batch ` +
            `[${verdict.rule}]: ${verdict.reason ?? "no reason given"} — marking failed`,
        );
        invalidInputs.push(input);
        selectedInputs.push(input);
        continue;
      }

      const worker = this.pool.acquireWorker(dustFilter);
      if (!worker) break; // no free workers

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
        input,
      });
    }

    if (txs.length === 0 && invalidInputs.length === 0) return null;

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
      `Built batch B${String(batchId).padStart(2, "0")}: ${txs.length} tx(s) [${assignments}]` +
        (invalidInputs.length > 0 ? ` + ${invalidInputs.length} invalid input(s)` : "") +
        ` [pool: ${this.pool.getStatus()}]`,
    );
    return {
      selectedInputs,
      data: { txs, selectedInputs, workerAssignments, reservedInputKeys, traceInfos, batchId, invalidInputs },
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
    timeoutMs?: number,
  ): Promise<void> {
    const effectiveTimeoutMs = timeoutMs ?? this.config.dustWaitTimeoutMs ?? 60_000;
    const walletResult = this.walletResults[walletIndex];
    if (!walletResult) return;
    const label = `${walletIndex + 1}/${this.walletSeeds.length}`;

    // Value-aware gate: a coin only counts when its generated value covers
    // fee + overhead — never a bare availableCoins.length check.
    try {
      const info = await this.getSpendableDustInfo(walletIndex);
      if (info.spendable > 0) {
        this.walletDustExhausted[walletIndex] = false;
        return;
      }
      this.log.log(
        `Wallet ${label}: no SPENDABLE dust (${info.total} coins, values=[${
          info.values.map(formatDust).join(", ")
        }] DUST), waiting up to ${effectiveTimeoutMs}ms...`,
      );
    } catch {
      return;
    }

    const start = Date.now();
    while (Date.now() - start < effectiveTimeoutMs) {
      await new Promise((r) => setTimeout(r, 1_000));
      try {
        const info = await this.getSpendableDustInfo(walletIndex);
        if (info.spendable > 0) {
          this.log.log(
            `Wallet ${label}: spendable dust available after ${Date.now() - start}ms ` +
              `(${info.spendable}/${info.total} coins)`,
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
      `Wallet ${label}: dust still unavailable after ${effectiveTimeoutMs}ms, proceeding to balance (will likely fail and re-queue)`,
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

    // NOTE: no facade wallet.state() read here — under dust-only sync the aux
    // sub-wallets are suspended, so the combined observable never emits and a
    // timeout-guarded read silently burned its full timeout on EVERY balance.
    // waitForDustAvailability reads the dust sub-wallet state directly.
    await this.waitForDustAvailability(walletIndex);

    const keys = {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    // Restrict balancing to dust ONLY. The batcher's purpose is to pay fees;
    // it must NOT balance the user's shielded/unshielded portion.
    //
    // Without this, balanceFinalizedTransaction defaults to tokenKindsToBalance:'all',
    // which makes the batcher's wallet call shielded.balanceTransaction() on the
    // user's tx. For a mint output (an unbalanced shielded outflow with no input)
    // the batcher's shielded balancer either tries to spend a coin it doesn't own
    // or absorbs the imbalance into its own wallet — either way the user never
    // sees the minted coin in their balance.
    //
    // Shielded padding (when enabled via addShieldedPadding) is added separately
    // via applyShieldedPadding(), so this restriction does not break it.
    const opts = { ttl: createTtl(), tokenKindsToBalance: ["dust"] as const };

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

    // Final policy gate before any dust is spent: runs the FULL policy
    // (declarative + custom filter). buildBatchData already re-checked the
    // declarative half synchronously; this covers the async custom filter.
    if (isPolicyEnforced(this.config.policy as MidnightTxPolicy<never> | undefined)) {
      const verdict = await evaluatePolicy(
        {
          tx: entry.tx as unknown as PolicyInspectableTx,
          txStage: entry.txStage,
          input: trace.input,
        },
        this.config.policy as MidnightTxPolicy<PolicyInspectableTx> | undefined,
      );
      if (!verdict.valid) {
        // Input failure (NOT infra): retry-charged and dropped with a warning.
        throw new Error(
          `Rejected by policy (${verdict.rule}): ${
            verdict.reason ?? "transaction not permitted for this target"
          }`,
        );
      }
    }

    // --- Phase 1: Balance (under wallet lock) ---
    this.log.log(`[${tag}] Acquiring balance lock${retryTag}...`);
    const releaseBalanceLock = await this.pool.acquireBalanceLock(walletIdx);
    let recipe: BalancingRecipe;
    const balanceStart = performance.now();
    const dustBefore = await this.getDustBalance(walletIdx);
    try {
      this.log.log(`[${tag}] Balancing (${entry.txStage})...`);
      recipe = await this.balanceEntry(entry, walletIdx);
    } finally {
      releaseBalanceLock();
    }
    // Refresh cached UTXO count in the background so the next tx's fast
    // path reflects what's left after this balance.
    void this.refreshUtxoCountAfterBalance(walletIdx);
    const dustAfter = await this.getDustBalance(walletIdx);
    const dustCost = dustBefore - dustAfter;
    const balanceMs = Math.round(performance.now() - balanceStart);
    this.log.log(`[${tag}] Balanced (${balanceMs}ms) — dust cost: ${formatDust(dustCost)} DUST`);

    // --- Phase 2: Sign + Finalize (no lock — concurrent safe) ---
    // signRecipe failures are NOT auto-reverted by the facade (finalizeRecipe
    // and submitTransaction are) — without an explicit revert, the dust coin
    // booked by balanceEntry is stranded in pendingDust until the 3h grace
    // period, permanently shrinking the fee-lane pool (grand-e2e root cause).
    const proveStart = performance.now();
    let signedRecipe;
    try {
      signedRecipe = await walletResult.wallet.signRecipe(
        recipe,
        (payload: Uint8Array) =>
          walletResult.unshieldedKeystore.signData(payload),
      );
    } catch (error) {
      this.log.warn(`[${tag}] signRecipe failed — reverting booked dust: ${error}`);
      await walletResult.wallet.revert(recipe).catch((e) =>
        this.log.warn(`[${tag}] revert after signRecipe failure also failed: ${e}`)
      );
      throw error;
    }
    const finalized = await walletResult.wallet.finalizeRecipe(signedRecipe);
    const proveMs = Math.round(performance.now() - proveStart);
    this.log.log(`[${tag}] Proved (${proveMs}ms)`);

    // --- Phase 3: Submit ---
    const txHash = finalized.transactionHash().toString();

    // Diagnostic: dump what the merged tx is going to put on chain. Specifically,
    // we want to see (a) the per-segment imbalances (a missing entry for a token
    // that should be present means the user's output was stripped during merge)
    // and (b) the intent identifiers (one per intent — if only the batcher's
    // intent is here, the user's intent disappeared during balance/merge).
    try {
      // deno-lint-ignore no-explicit-any
      const ftx = finalized as any;
      const ids = typeof ftx.identifiers === "function" ? ftx.identifiers() : undefined;
      const segImbalances: Record<string, unknown> = {};
      for (const seg of [0, 1]) {
        try {
          const m = typeof ftx.imbalances === "function" ? ftx.imbalances(seg) : undefined;
          if (m && typeof m.entries === "function") {
            const entries: [string, string][] = [];
            for (const [k, v] of m.entries() as Iterable<[unknown, bigint]>) {
              entries.push([
                typeof k === "object" && k !== null ? JSON.stringify(k, (_, vv) => typeof vv === "bigint" ? vv.toString() : vv) : String(k),
                v.toString(),
              ]);
            }
            segImbalances[`seg${seg}`] = entries;
          }
        } catch (_e) {
          // ignore — segment may not exist
        }
      }
      this.log.log(`[${tag}] merged-tx ids=${JSON.stringify(ids)} imbalances=${JSON.stringify(segImbalances)}`);
    } catch (e) {
      this.log.warn(`[${tag}] merged-tx diagnostic failed: ${e}`);
    }

    this.log.log(`[${tag}] Submitting (hash: ${txHash})...`);
    const submitStart = performance.now();

    // Keep a handle on the real submit promise: when the race times out we
    // proceed optimistically (tx may still land), but if the underlying
    // submit ultimately REJECTS, its booked dust must be reverted — otherwise
    // the coin is stranded until the grace period.
    const submitPromise = walletResult.wallet.submitTransaction(finalized);
    let timedOut = false;
    submitPromise.catch((err) => {
      if (!timedOut) return; // non-timeout failures are handled below / by the facade
      this.log.warn(
        `[${tag}] submit ultimately failed after timeout — reverting booked dust: ${err}`,
      );
      void walletResult.wallet.revertTransaction(finalized).catch(() => {});
    });
    try {
      await Promise.race([
        submitPromise,
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
      } else if (errMsg.includes("submitTransaction timed out")) {
        // The tx was submitted to the node but the WebSocket subscription for
        // InBlock/Finalized status didn't respond in time. The tx may still be
        // in the mempool or already in a block. Return the hash and let
        // waitForTransactionReceipt verify confirmation via the indexer.
        const submitMs = Math.round(performance.now() - submitStart);
        this.log.warn(
          `[${tag}] submitTransaction timed out after ${submitMs}ms — tx may still land, proceeding with hash`,
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

    // Fail invalid (undeserializable) inputs up front: splicing them out of
    // selectedInputs makes the processor's diff path increment their retry
    // counts, so they are bounded-retried and then dropped WITH a log.
    if (batchData.invalidInputs.length > 0) {
      const invalidSet = new Set(batchData.invalidInputs);
      for (let i = batchData.selectedInputs.length - 1; i >= 0; i--) {
        if (invalidSet.has(batchData.selectedInputs[i])) {
          batchData.selectedInputs.splice(i, 1);
        }
      }
      this.log.warn(
        `[${bTag}] ${batchData.invalidInputs.length} invalid input(s) marked failed (deserialize)`,
      );
      if (txs.length === 0) {
        throw new Error(
          `All ${batchData.invalidInputs.length} inputs failed to deserialize (invalid input)`,
        );
      }
    }

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

  /**
   * Operational snapshot for /queue-stats. In a multi-product batcher this is
   * how you see WHICH product is out of fee capacity without reading logs.
   * Uses cached state only — no chain/indexer calls, safe to poll.
   */
  getHealthInfo(): Record<string, unknown> {
    return {
      wallets: this.walletSeeds.length,
      walletsReady: this.walletInitialized.filter(Boolean).length,
      dustUtxos: this.availableDustUtxoCounts.map((c) => c ?? 0),
      dustExhausted: this.walletInitialized.every(
        (ok, i) => !ok || this.walletDustExhausted[i],
      ),
      workersBusy: this.pool.getTotalWorkerCount() - this.pool.getFreeWorkerCount(),
      workersTotal: this.pool.getTotalWorkerCount(),
      inFlightInputs: this.inFlightInputKeys.size,
      policy: !isPolicyEnforced(this.config.policy as MidnightTxPolicy<never> | undefined)
        ? "allow-all"
        : {
          allowZswapTransfers: this.config.policy?.allowZswapTransfers ?? false,
          allowedContracts: this.config.policy?.allowedContracts?.length ?? 0,
          allowedCircuits: this.config.policy?.allowedCircuits?.length ?? 0,
          customFilter: Boolean(this.config.policy?.allowCustomFinalFilter),
        },
    };
  }

  /**
   * Release this adapter's exclusive claim on its wallet seeds.
   *
   * The claim is process-wide and taken at construction, so without this a
   * batcher that is torn down and rebuilt in the same process — a
   * reconfiguration, or a test suite building several adapters — would fail on
   * the second construction with "wallet seed already in use". The release is
   * ownership-checked, so it can only drop claims this adapter actually holds.
   */
  private claimWallet(walletResult: unknown): void {
    const key = claimWalletInstance(
      walletResult,
      this.config.logLabel ?? "unlabeled adapter",
    );
    if (key) this.claimedWalletKeys.push(key);
  }

  async close(): Promise<void> {
    releaseWalletSeeds(this.seedClaim);
    // Only keys this adapter claimed are in the list, so this cannot drop
    // another adapter's claim even if two share a log label.
    for (const key of this.claimedWalletKeys) claimedWalletInstances.delete(key);
    this.claimedWalletKeys = [];

    for (const [index, result] of this.walletResults.entries()) {
      // An injected wallet belongs to whoever passed it in and may well still
      // be in use there; stopping it would break a caller that did nothing
      // wrong. We stop only what we built.
      if (this.walletIsInjected[index]) continue;
      try {
        await (result as { wallet?: { stop?: () => Promise<void> } })?.wallet
          ?.stop?.();
      } catch (error) {
        this.log.warn(
          `wallet stop failed during close: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  verifySignature(_input: DefaultBatcherInput): boolean {
    return true;
  }

  /**
   * Reject oversized or undeserializable payloads at /send-input time,
   * BEFORE they enter the queue. A hex-shape check is not enough: valid hex
   * that is not a serialized Midnight transaction would be accepted, fail
   * deserialization on every poll tick, and (pre-hardening) sit in the queue
   * forever. Running the real deserializer here makes intake authoritative.
   */
  async validateInput(input: DefaultBatcherInput): Promise<ValidationResult> {
    const maxChars = this.config.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
    if (input.input.length > maxChars) {
      return {
        valid: false,
        error: `Input too large (${input.input.length} chars, max ${maxChars})`,
      };
    }
    let entry: DelegatedTxEntry;
    try {
      const { hex } = this.parseHexInput(input.input);
      if (!/^[0-9a-fA-F]+$/.test(hex)) {
        return { valid: false, error: "Input is not valid hex" };
      }
      entry = this.deserializeTxEntry(input);
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    // HARD gates, before any policy runs. A custom filter may tighten what a
    // product sponsors, but must never be able to raise the ceilings that
    // protect the process — so these are not expressible as policy.
    const hardVerdict = this.hardGateVerdict(entry);
    if (hardVerdict) {
      this.log.warn(
        `Refused #${inputContentHash(input.input)} at intake ` +
          `[${hardVerdict.errorCode}]: ${hardVerdict.error}`,
      );
      return hardVerdict;
    }

    // Content-based authorization: declarative rules first, then the custom
    // final filter. Both fail closed.
    const verdict = await evaluatePolicy(
      {
        tx: entry.tx as unknown as PolicyInspectableTx,
        txStage: entry.txStage,
        input,
      },
      this.config.policy as MidnightTxPolicy<PolicyInspectableTx> | undefined,
    );
    if (!verdict.valid) {
      this.log.warn(
        `Policy rejected #${inputContentHash(input.input)} at intake ` +
          `[${verdict.rule}]: ${verdict.reason ?? "no reason given"}`,
      );
      return {
        valid: false,
        error: `Rejected by policy (${verdict.rule}): ${
          verdict.reason ?? "transaction not permitted for this target"
        }`,
      };
    }
    // Report what this input will actually cost to verify, so the batcher can
    // charge it rather than the flat unit it paid on arrival.
    return {
      valid: true,
      admissionWeight: admissionWeight(entry.tx as unknown as PolicyInspectableTx),
    };
  }

  /**
   * The gates a policy cannot loosen: maintenance updates and structural
   * ceilings. Returns a rejection, or `undefined` when the transaction clears
   * them.
   *
   * Shared by intake and the pre-batch recheck, because storage rows are
   * untrusted — they can be edited on disk, and the limits may have been
   * tightened since the input was accepted. A gate enforced only at intake is
   * not a gate.
   */
  private hardGateVerdict(entry: DelegatedTxEntry): ValidationResult | undefined {
    const tx = entry.tx as unknown as PolicyInspectableTx;

    // A maintenance update can rotate a contract's verifier keys and its
    // maintenance authority. Refused outright, before anything else looks at
    // it, and regardless of whether the contract is allowlisted.
    let actions;
    try {
      actions = contractActions(tx);
    } catch (e) {
      return {
        valid: false,
        error: `could not read contract actions: ${
          e instanceof Error ? e.message : String(e)
        }`,
        errorCode: "ACTION_INTROSPECTION_FAILED",
      };
    }
    if (actions.some((action) => action.entryPoint === "")) {
      return {
        valid: false,
        error:
          "transaction contains a contract deploy or maintenance update; " +
          "this batcher sponsors circuit calls only",
        errorCode: "UNSUPPORTED_MAINTENANCE_UPDATE",
      };
    }

    const shape = checkShapeLimits(tx, this.config.shapeLimits ?? DEFAULT_SHAPE_LIMITS);
    if (!shape.valid) {
      return {
        valid: false,
        error: shape.reason ?? "transaction shape exceeds this target's limits",
        errorCode: shape.errorCode,
      };
    }

    return undefined;
  }

  /**
   * Pre-batch DECLARATIVE re-check (synchronous, so it can run inside
   * buildBatchData). Storage rows are untrusted — they can be tampered with on
   * disk, and the policy may have been tightened since the input was accepted.
   * The async half (custom filter) runs in processWorkerTx.
   */
  private declarativePolicyVerdict(entry: DelegatedTxEntry) {
    return evaluateDeclarativePolicy(
      entry.tx as unknown as PolicyInspectableTx,
      this.config.policy as MidnightTxPolicy<never> | undefined,
    );
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
