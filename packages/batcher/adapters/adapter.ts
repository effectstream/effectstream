// Implements a adapter interface for the batcher responsible for handling blockchain interactions

import type { DefaultBatcherInput } from "../core/types.ts";
import type { RateLimitKeyStrategy } from "../core/rate-limiter.ts";

/**
 * Generic blockchain transaction hash type
 * Can represent transaction hashes from any blockchain
 */
export type BlockchainHash = string;

/**
 * Result of input validation operations
 */
export type ValidationResult = {
  /** Whether the input is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /**
   * Stable, machine-readable reason (e.g. `"NOT_WELL_FORMED"`). Prefer this over
   * parsing `error`, whose text may include detail derived from the submitted
   * transaction.
   */
  errorCode?: string;
  /**
   * HTTP status to return. Defaults to 400.
   *
   * Use 503 when validation could not be *completed* — the check's own
   * dependency was unavailable — rather than when the input was judged and
   * found wanting. Telling a caller their transaction is malformed because our
   * indexer is down is both wrong and unactionable.
   */
  statusCode?: number;
  /** True when re-submitting the identical input could later succeed. */
  retryable?: boolean;
  /**
   * What this input should cost against the caller's admission budget, in the
   * limiter's units (proof-bearing elements for Midnight).
   *
   * Only meaningful on a `valid: true` result. The batcher charges a flat unit
   * at authentication — before the payload has been deserialized, when all it
   * knows is that a request arrived — and charges the remainder here, once the
   * adapter has measured the work the input will actually cause. Omit it and
   * the input costs the flat unit, exactly as before.
   */
  admissionWeight?: number;
};

/**
 * One input that can never succeed, however many times it is retried.
 *
 * Its row is removed and any caller waiting on it is rejected with these
 * fields. Reserve this for verdicts about the *input*: if our own environment
 * is what failed, the input has not been judged — use {@link BatchInputDeferral}.
 */
export interface BatchInputRejection<TInput = DefaultBatcherInput> {
  input: TInput;
  /** Human-readable reason, surfaced to the caller. */
  error: string;
  /** Stable, machine-readable reason (e.g. `"NOT_WELL_FORMED"`). */
  errorCode?: string;
  /** HTTP status for the waiting caller. Defaults to 400. */
  statusCode?: number;
}

/**
 * One input the batcher could not carry this round through no fault of its
 * own — a saturated validation queue, an unreachable dependency.
 *
 * The row is left untouched and **no retry is charged**: a user's retry budget
 * exists to bound bad inputs, not to absorb our outages.
 */
export interface BatchInputDeferral<TInput = DefaultBatcherInput> {
  input: TInput;
  /** Why this input could not be carried right now. */
  reason: string;
  /**
   * This deferral is OUR INFRASTRUCTURE failing — an unreachable node, a dead
   * indexer — rather than a queue of ours that happened to be full.
   *
   * The difference is what the batcher should do next. A saturated validation
   * queue frees up on its own and the target should keep polling; an
   * unreachable node will refuse the identical work on the identical schedule
   * for as long as it is down, so the target is RESTED (see
   * {@link BatchOutcome.cooldownMs}) instead of rebuilding and re-proving the
   * same doomed batch every poll round.
   *
   * Optional and additive: an adapter that never sets it behaves exactly as
   * adapters did before this field existed.
   */
  infra?: boolean;
}

/**
 * One input that failed in the adapter's legacy balance/sign/submit pipeline.
 *
 * Unlike a deterministic rejection, this consumes one unit of the input's
 * bounded retry budget. The row and callback remain pending unless storage
 * drops the row at the configured retry limit.
 */
export interface BatchInputFailure<TInput = DefaultBatcherInput> {
  input: TInput;
  /** Human-readable diagnostic for logs; not a permanent input verdict. */
  error: string;
}

/**
 * One or more inputs whose adapter pipeline broke an internal invariant.
 *
 * When `inputs` is present, independent workers' submitted/rejected/deferred
 * outcomes remain trustworthy and are applied before the target is paused.
 * Omitting it means the failure is unscoped, so the processor conservatively
 * suppresses every verdict in the batch as defence-in-depth.
 */
export interface BatchInvariantFailure<TInput = DefaultBatcherInput> {
  message: string;
  errorCode?: string;
  /** Inputs affected by the invariant; retained and charged no retry. */
  inputs?: TInput[];
  /** Infinite cooldown: operator intervention is required before retrying. */
  hardPause?: boolean;
}

/**
 * What actually happened to each input in a batch.
 *
 * An adapter may keep returning a bare {@link BlockchainHash}, which means
 * "every selected input was submitted" and behaves exactly as before. Return
 * this object instead when inputs can have differing fates.
 *
 * Every list is optional so an adapter states only what applies. Inputs
 * omitted from every per-input list are treated as submitted when a `hash` is
 * present.
 */
export interface BatchOutcome<TInput = DefaultBatcherInput> {
  /**
   * Hash of the transaction that was submitted, if one was. Absent when every
   * input was rejected or deferred — there is then nothing to confirm.
   *
   * Its presence means "submitted, awaiting confirmation", never "confirmed":
   * rows are still removed only after a receipt arrives.
   */
  hash?: BlockchainHash;
  /** Inputs carried by `hash`. Defaults to the batch's selected inputs. */
  submitted?: TInput[];
  /** Inputs that can never succeed. Removed; their callers are rejected. */
  permanentRejected?: BatchInputRejection<TInput>[];
  /** Inputs to leave queued, uncharged, for a later round. */
  retryable?: BatchInputDeferral<TInput>[];
  /** Inputs left queued after consuming one bounded retry. */
  failed?: BatchInputFailure<TInput>[];
  /**
   * The batch broke an invariant the batcher cannot reason about — for
   * example a transaction that validated, failed after finalization, and then
   * validated again.
   *
   * A scoped failure parks its `inputs` while independent worker outcomes are
   * still applied. An unscoped failure parks the whole batch and suppresses
   * its verdicts because the batcher cannot know which input is at fault.
   */
  invariantFailure?: BatchInvariantFailure<TInput>;
  /**
   * Rest this target for at least this many milliseconds before the next round.
   *
   * The batcher has always been able to park a target on a cooldown, but only
   * for a failure THROWN out of `submitBatch`. An adapter that runs its workers
   * under `Promise.allSettled` and reports per-input fates cannot throw, so its
   * outages had no way to ask for a rest and every poll round re-ran a full
   * balance/prove pipeline against a dead node. This is that channel.
   *
   * Advisory, and additive: omit it and the processor decides for itself from
   * the `infra` deferrals in this outcome, exactly as an adapter written before
   * this field would behave.
   */
  cooldownMs?: number;
}

/**
 * A transaction the batcher may already have put on chain, as the chain sees it.
 *
 * The answer to {@link BlockchainAdapter.findLandedTransaction} — see there for
 * why a batcher has to be able to ask.
 */
export interface LandedTransaction {
  /** The hash the chain knows it by; recorded verbatim for the caller. */
  hash: BlockchainHash;
  /** Block it was included in, when the chain will say. */
  blockNumber?: bigint;
  /** 1 = mined and succeeded (the default), 0 = mined and failed. */
  status?: number;
}

/**
 * What `submitBatch` may return: a bare hash (all-or-nothing, the original
 * contract) or a per-input {@link BatchOutcome}.
 */
export type BatchSubmitResult<TInput = DefaultBatcherInput> =
  | BlockchainHash
  | BatchOutcome<TInput>;

/**
 * Generic blockchain transaction receipt type
 * Contains common fields that most blockchains have
 */
export interface BlockchainTransactionReceipt {
  /** Transaction hash */
  hash: BlockchainHash;
  /** Block number where transaction was included */
  blockNumber: bigint;
  /** Transaction status (1 = success, 0 = failure) */
  status: number;
  /** Additional blockchain-specific fields can be added via extension */
  [key: string]: any;
}

/**
 * Options for batch building
 */
export interface BatchBuildingOptions {
  /** Maximum size of the batch in bytes */
  maxSize?: number;
}

/**
 * Result of batch building operation
 */
export interface BatchBuildingResult<TOutput> {
  /** Inputs that were selected for this batch */
  selectedInputs: DefaultBatcherInput[];
  /** Serialized batch data. The type (TOutput) is defined by the adapter implementation. */
  data: TOutput;
}

/**
 * Base interface for blockchain adapters that handle chain-specific operations
 * Provides a unified interface for different blockchain interactions
 */
export interface BlockchainAdapter<TOutput> {
  /**
   * Submit a batch transaction to the blockchain.
   *
   * Returning a bare hash means every selected input was submitted — the
   * original contract, and still the right answer for adapters whose inputs
   * share one fate. Return a {@link BatchOutcome} when they do not, so the
   * batcher can reject the doomed, leave the merely deferred alone, and
   * confirm the rest.
   *
   * @param data - The type-safe batch data, as constructed by buildBatchData.
   * @param fee - The fee to pay for the transaction.
   * @returns Promise resolving to a transaction hash or a per-input outcome
   */
  submitBatch(
    data: TOutput,
    fee: string | bigint,
  ): Promise<BatchSubmitResult<DefaultBatcherInput>>;

  /**
   * Estimate the fee for submitting a batch.
   * @param data - The type-safe batch data payload to estimate for.
   * @returns Estimated fee
   */
  estimateBatchFee(data: TOutput): Promise<string | bigint> | string | bigint;

  /**
   * Build batch data from a collection of inputs.
   * This method is now part of the adapter itself.
   * @param inputs - Array of inputs to batch
   * @param options - Options for batch building
   * @returns Batch building result or null if no inputs could be batched
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions,
  ): BatchBuildingResult<TOutput> | null;

  /**
   * Wait for a transaction to be confirmed on the blockchain
   * @param hash - The transaction hash to wait for
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise resolving to transaction receipt
   */
  waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout?: number,
  ): Promise<BlockchainTransactionReceipt>;

  /**
   * Get the current account/address for this adapter
   * @returns The account address as a string
   */
  getAccountAddress(): string;

  /**
   * Get the current chain name or identifier
   * @returns The chain name/identifier
   */
  getChainName(): string;

  /**
   * Check if the adapter is ready to submit transactions
   * @returns True if the adapter is operational
   */
  isReady(): boolean;

  /**
   * Get the block number of the latest confirmed block
   * @returns Promise resolving to current block number
   */
  getBlockNumber(): Promise<bigint>;

  /**
   * Optional sync protocol name used to filter EffectStream Sync events
   * If not provided, the batcher will fall back to the adapter's chain name
   */
  getSyncProtocolName?(): string;

  /**
   * (Optional) Verifies the input signature.
   * If not implemented, the batcher will use its default EVM verification logic.
   * Adapters for chains without signatures (like Midnight) should override this
   * to return `true`.
   * @param input - The input containing the signature.
   * @returns A promise resolving to true if the signature is valid.
   */
  verifySignature?(input: DefaultBatcherInput): boolean | Promise<boolean>;

  /**
   * (Optional) Validate an input _before_ it is added to the storage queue.
   * This is used for adapter-specific semantic validation, like checking
   * circuit arguments or payload formats.
   * @param input - The input to validate.
   * @returns A promise resolving to a ValidationResult.
   */
  validateInput?(
    input: DefaultBatcherInput,
  ): ValidationResult | Promise<ValidationResult>;

  /**
   * (Optional) The key that answers "have we already PAID to put this spend on
   * chain?" — the batcher's replay/dedup gate (spec FR-006b).
   *
   * **Derive it from what the CHAIN would consider the same spend.** That is
   * the whole contract, and it is not the same thing as "the same request":
   *
   *  - the batcher's own `requestId` hashes the full content key, which
   *    includes `target` — a field most wallets do not sign. A replayed
   *    signature wrapped in a rewritten envelope therefore yields a DIFFERENT
   *    requestId while being the SAME spend, and the gate exists to catch
   *    exactly that;
   *  - so the key must collide across everything an attacker can rewrite, and
   *    separate everything they cannot.
   *
   * Not implementing this is fine and is the common case: the batcher then uses
   * sha256 of `input.signature`, which is public on chain and is the one field
   * a replayer cannot re-mint. Implement it when your inputs are not
   * signature-bearing — the Midnight balancing adapter takes a whole
   * transaction, so it keys on the transaction's own chain-level identifiers.
   *
   * An adapter that implements this is AUTHORITATIVE, including when it returns
   * `undefined`: the batcher will not fall back to the signature default,
   * because only the adapter knows what its payloads mean. `undefined` means
   * "admit this input without replay protection" — never "refuse it".
   *
   * Called once per accepted input, after `validateInput` and before anything
   * is queued. Must be cheap: if deriving the key needs work `validateInput`
   * already did, cache it there rather than repeating it here.
   */
  getReplayKey?(input: DefaultBatcherInput): string | undefined;

  /**
   * (Optional) Did an EARLIER submission of this input already reach the chain?
   *
   * Asked before the batcher charges a retry, and it exists because of a
   * measured lie. A batcher restarted while a batch is in flight loses the
   * receipts but not the rows: the transactions land, the surviving rows are
   * re-picked, the resubmission is refused because the spends are already
   * used, three retries are charged, the rows are dropped — and the request is
   * published as `failed / RETRIES_EXHAUSTED` for work the chain CONFIRMED.
   * (00017's Q-2; observed verbatim as 00020's M13, with an on-chain counter
   * proving all four transactions landed.)
   *
   * The adapter is asked rather than the batcher deciding, because only the
   * adapter knows what its payloads mean — Midnight watches the transaction's
   * own ledger identifiers, which survive the re-proving and re-serialization
   * a hash does not.
   *
   * Contract, and it is a strict one: return a transaction ONLY when this
   * SPECIFIC input is on chain. A batch-level answer would confirm every input
   * in the batch the moment any one of them was found, which reports a chain
   * verdict for a request the chain never saw — the same class of lie as the
   * defect this closes. When in doubt, return `undefined`: the input is then
   * charged exactly as it is today, which is the pre-existing behaviour.
   *
   * `context.transactionHash` is what the request's own status record kept from
   * its last `submitted` transition, when there is a record and it got that
   * far. Absent means the batcher died before it could write one down — the
   * adapter's own identifiers are then the only evidence there is.
   *
   * Failures are swallowed by the batcher and treated as `undefined`: an
   * unreachable indexer must never be the reason a batch loop stops.
   */
  findLandedTransaction?(
    input: DefaultBatcherInput,
    context: { target: string; transactionHash?: string },
  ): Promise<LandedTransaction | undefined>;

  /**
   * (Optional) Operational snapshot for `/queue-stats`, e.g. fee capacity,
   * worker occupancy, configured policy. Must be cheap and side-effect free —
   * it is called per status request. Errors are swallowed by the server.
   */
  getHealthInfo?(): Record<string, unknown>;

  /**
   * (Optional) Resolves once this adapter is past any startup work that blocks
   * the main event loop, so it is safe to accept HTTP traffic.
   *
   * The batcher holds the HTTP port closed until every adapter that implements
   * this says so. Adapters that do not implement it are treated as immediately
   * servable, which is the previous behaviour.
   *
   * Why this exists: the Midnight balancing adapter restores its dust wallet by
   * deserializing the snapshot in WASM **synchronously on the main thread** —
   * measured at ~46 s for a 5.1 MB preprod snapshot. The server used to be
   * listening throughout, so every restart was a ~46-second window in which
   * connections were accepted and no handler could run, because no handler can
   * run while the loop is blocked. A refused connection is strictly better than
   * one that hangs: the client learns immediately and can retry or fail over.
   *
   * Contract: resolve when the blocking phase is over, **however it ended** —
   * including on failure. This gate must never be the reason a batcher has no
   * endpoints; a rejection or a throw is logged and treated as servable, and a
   * promise that never settles is bounded by `httpServerReadinessTimeoutMs`.
   * It says nothing about whether the adapter can submit transactions yet —
   * that is `isReady()`.
   */
  whenServable?(): Promise<void>;

  /**
   * (Optional) Recover adapter state after batcher initialization.
   * This is called after storage.init() but before processing starts,
   * allowing adapters to rebuild internal state from persisted inputs.
   * Useful for stateful adapters (e.g., Bitcoin tracking reserved funds).
   * @param pendingInputs - All pending inputs for this adapter from storage.
   */
  recoverState?(pendingInputs: DefaultBatcherInput[]): Promise<void> | void;

  /**
   * (Optional) Release resources held by this adapter. Called once during
   * graceful shutdown, after batch processing has stopped.
   *
   * Adapters that claim a process-wide exclusive resource (the Midnight
   * balancing adapter claims its wallet seeds) must give it back here, or a
   * batcher that is reconfigured or restarted inside one process can never
   * re-acquire it. Errors are logged and swallowed — a failed close must not
   * block shutdown.
   */
  close?(): Promise<void> | void;

  /**
   * (Optional) Declare the rate limit key strategy for this adapter.
   * Identity keys are consumed only after the adapter verifies the signature;
   * every strategy also consumes the adapter target's global sponsor bucket.
   * - "ip": Per-IP identity quota (default if not implemented)
   * - "ip-and-address": Shared IP/global ceiling plus per-wallet quota
   * - "composite": Per IP+verified-address quota
   */
  getRateLimitKeyStrategy?(): RateLimitKeyStrategy;

  /**
   * (Optional) Check if the adapter can accept more concurrent batch work.
   *
   * Adapters with multiple independent signers/wallets can process several
   * batches in parallel. When this method is implemented and returns `true`,
   * the batcher will spawn concurrent batch processing instead of blocking
   * on a single batch at a time.
   *
   * Adapters that do NOT implement this method retain the default sequential
   * (one-batch-at-a-time) behavior.
   *
   * @returns `true` if the adapter has at least one free processing slot.
   */
  hasAvailableCapacity?(): boolean;

  /**
   * (Optional) Returns `true` when NO workers are busy — all concurrent
   * batches have completed. Used by the batcher to know when it is safe
   * to clear the `processingAdapters` flag during shutdown tracking.
   *
   * Adapters that implement `hasAvailableCapacity` should also implement
   * this. If omitted, the batcher falls back to `hasAvailableCapacity`.
   */
  isFullyIdle?(): boolean;

  /**
   * (Optional) Release resources reserved by `buildBatchData` when batch
   * processing fails before `submitBatch` completes.
   *
   * When `hasAvailableCapacity` is implemented, `buildBatchData` may
   * eagerly mark internal resources (e.g. wallets, in-flight inputs) as
   * reserved. If the downstream pipeline throws before `submitBatch` can
   * clean up, this method is called to release those resources.
   *
   * @param batchData - The same data object returned by `buildBatchData`.
   */
  releaseBatchResources?(batchData: TOutput): void;
}
