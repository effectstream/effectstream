import {
  ConfigSyncProtocolType,
  type PrimitiveEntry,
  SOLANA_PRIMITIVE_ACCOUNT_BALANCE,
  SOLANA_PRIMITIVE_PROGRAM_LOG,
  SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
} from "@effectstream/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type {
  ConfigType,
  Input,
  Output,
  Page,
  PrimitiveType,
} from "./types.ts";
import {
  resolveAccountKeys,
  SolanaClient,
  type SolanaBlock,
  SolanaRateLimitError,
  type SolanaTokenBalance,
} from "./SolanaClient.ts";
import { requestTimeoutOf } from "../common/http.ts";
import { extractProgramLogs } from "./program-logs.ts";
import { all, call, sleep, type Operation } from "effection";
import { bound } from "@effectstream/utils";

/**
 * Attempts per slot before `readData` reports partial progress and lets the
 * fetch loop retry the range. Small on purpose — the outer loop is the real
 * retry mechanism; see `getBlockWithRetry`.
 */
const BLOCK_FETCH_ATTEMPTS = 3;
/** Linear backoff between those attempts (250ms, then 500ms). */
const BLOCK_FETCH_RETRY_DELAY_MS = 250;

/**
 * Rate limiting (HTTP 429). A rate-limited request does not count as one of the
 * {@link BLOCK_FETCH_ATTEMPTS}: the fetcher waits — the provider's
 * `Retry-After`, or an exponential backoff from `rateLimitBackoffMs` doubling
 * up to `rateLimitMaxBackoffMs` — and asks again, up to `rateLimitRetries`
 * times per slot. After that the slot fails like any other error (bounded, see
 * `getBlockWithRetry`), and the fetch loop retries the range on its next poll.
 * A provider's limit therefore slows the node down instead of stopping it.
 */
const DEFAULT_RATE_LIMIT_RETRIES = 10;
/**
 * `getBlock` calls in flight at once. One call takes ~0.5 s even on a private
 * devnet RPC, so one at a time reads ~2 blocks/s, slower than devnet's ~2.5
 * slots/s: a sequential reader falls further behind forever. Eight in flight
 * read ~17 blocks/s (AA 00057 measurements). The level adapts: it halves after
 * a batch that was rate-limited, and grows back by one after
 * {@link CONCURRENCY_RECOVERY_BATCHES} clean batches, up to the configured cap.
 */
const DEFAULT_GETBLOCK_CONCURRENCY = 8;
const CONCURRENCY_RECOVERY_BATCHES = 10;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 500;
const DEFAULT_RATE_LIMIT_MAX_BACKOFF_MS = 15_000;

export class SolanaFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: SolanaClient;

  /**
   * Last non-null `blockTime` seen, used to fill in a block whose timestamp the
   * RPC couldn't compute. Carried across `readData` calls so only a null on the
   * very first block ever fetched has no fallback.
   */
  private lastKnownBlockTime: number | undefined;

  /**
   * Messages already logged by `warnOnce`. `readPrimitives` runs per transaction,
   * so a misconfigured primitive would otherwise emit an identical line thousands
   * of times during catch-up and bury everything else.
   */
  private readonly warnedOnce = new Set<string>();

  private warnOnce(message: string): void {
    if (this.warnedOnce.has(message)) return;
    this.warnedOnce.add(message);
    console.warn(message);
  }

  /** Pacing and rate-limit settings (sync protocol config; see the defaults above). */
  readonly getBlockMinIntervalMs: number;
  readonly getBlockConcurrency: number;
  readonly rateLimitRetries: number;
  readonly rateLimitBackoffMs: number;
  readonly rateLimitMaxBackoffMs: number;
  /** When the next `getBlock` may start (pacing; shared by concurrent requests). */
  private nextGetBlockAt = 0;
  /** The current (adaptive) number of `getBlock` calls in flight; never above `getBlockConcurrency`. */
  currentConcurrency: number;
  private cleanBatches = 0;
  /** Rate-limit waits so far (observability, tests). */
  rateLimitedWaits = 0;
  /** Transactions this reader could not parse and skipped (observability, tests). */
  unparsableTransactions = 0;

  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    const sp = config.syncProtocol as typeof config.syncProtocol & {
      maxSupportedTransactionVersion?: number;
      getBlockMinIntervalMs?: number;
      getBlockConcurrency?: number;
      rateLimitRetries?: number;
      rateLimitBackoffMs?: number;
      rateLimitMaxBackoffMs?: number;
    };
    this.client = new SolanaClient(
      config.network.rpcUrl,
      requestTimeoutOf(config.syncProtocol),
      { maxSupportedTransactionVersion: sp.maxSupportedTransactionVersion },
    );
    const nonNeg = (v: number | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    this.getBlockMinIntervalMs = nonNeg(sp.getBlockMinIntervalMs, 0);
    this.getBlockConcurrency = Math.max(1, Math.floor(nonNeg(sp.getBlockConcurrency, DEFAULT_GETBLOCK_CONCURRENCY)));
    this.currentConcurrency = this.getBlockConcurrency;
    this.rateLimitRetries = Math.floor(nonNeg(sp.rateLimitRetries, DEFAULT_RATE_LIMIT_RETRIES));
    this.rateLimitBackoffMs = nonNeg(sp.rateLimitBackoffMs, DEFAULT_RATE_LIMIT_BACKOFF_MS);
    this.rateLimitMaxBackoffMs = Math.max(this.rateLimitBackoffMs, nonNeg(sp.rateLimitMaxBackoffMs, DEFAULT_RATE_LIMIT_MAX_BACKOFF_MS));
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];

    console.log(
      `[Solana] Fetching slots from ${data.from} to ${data.to}.${
        data.isPresync ? " [presync]" : ""
      }`,
    );

    // Highest slot we have positively resolved — either read a block for, or had
    // the RPC confirm was skipped. The page may never advance past this, or we
    // would silently step over a slot we never actually read.
    let scannedThrough: number | undefined;
    let fetchFailure: { slot: number; error: unknown } | undefined;

    // Blocks are fetched up to `currentConcurrency` slots at a time (adaptive,
    // capped by `getBlockConcurrency`) and APPLIED strictly in slot order: a
    // batch is processed only once every request in it has settled, and a
    // failed slot ends the scan there (no gap, no reordering).
    const to = Number(data.to);
    let batch: { slot: number; ok: true; block: SolanaBlock | null }[] | null = null;
    let batchStart = Number(data.from);
    for (let slot = Number(data.from); slot <= to; slot++) {
      if (batch == null || slot >= batchStart + batch.length) {
        // A failure inside the previous batch ends the scan at the failed slot.
        if (fetchFailure != null) break;
        batchStart = slot;
        const slots = Array.from({ length: Math.min(this.currentConcurrency, to - slot + 1) }, (_, i) => slot + i);
        const waitsBefore = this.rateLimitedWaits;
        const results = yield* all(slots.map((s) => this.tryGetBlock(s)));
        this.adaptConcurrency(this.rateLimitedWaits > waitsBefore);
        const firstFailed = results.findIndex((r) => !r.ok);
        if (firstFailed !== -1) {
          const failed = results[firstFailed] as { slot: number; ok: false; error: unknown };
          batch = results.slice(0, firstFailed) as { slot: number; ok: true; block: SolanaBlock | null }[];
          // Keep the blocks already gathered rather than discarding the chunk:
          // everything below the failed slot is resolved, so we report progress
          // up to there and the next poll resumes exactly at the failed slot.
          fetchFailure = { slot: failed.slot, error: failed.error };
          if (batch.length === 0) break;
        } else {
          batch = results as { slot: number; ok: true; block: SolanaBlock | null }[];
        }
      }
      const entry = batch[slot - batchStart];
      if (!entry) break; // past a failure inside this batch
      const block = entry.block;
      scannedThrough = slot;

      // Skipped slots (no block produced) are skipped gracefully
      if (!block) {
        continue;
      }

      // `blockTime` is the merge key for this chain, so it can't be null.
      // Mapping null to 0 (the previous behaviour) sorted the block to the unix
      // epoch and broke the monotonicity the merge relies on. Solana guarantees
      // blockTime is non-decreasing, so reusing the last known value keeps the
      // block in the stream, in order, in the same bucket as its predecessor.
      const blockTime = block.blockTime ?? this.lastKnownBlockTime;
      if (blockTime == null) {
        console.warn(
          `[Solana] slot ${slot} has no blockTime and no earlier block to derive one from — skipping.`,
        );
        continue;
      }
      this.lastKnownBlockTime = blockTime;

      const primitives = yield* this.readPrimitives(
        slot,
        block,
        this.config.primitives,
      );

      outputs.push({
        output: {
          slot,
          blockhash: block.blockhash,
          blockTime,
          blockHeight: block.blockHeight,
          parentSlot: block.parentSlot,
          // `meta` is null for transactions the RPC couldn't decode; keep the
          // entry (it still occupies a tx index) but don't dereference it.
          transactions: (block.transactions ?? []).map((tx) => ({
            err: tx.meta?.err ?? null,
            logMessages: tx.meta?.logMessages ?? null,
            preBalances: tx.meta?.preBalances ?? [],
            postBalances: tx.meta?.postBalances ?? [],
          })),
          primitives,
        },
        cleanup: () => {},
      });
    }

    if (fetchFailure != null) {
      console.warn(
        `[Solana] slot ${fetchFailure.slot} could not be fetched after ` +
          `${BLOCK_FETCH_ATTEMPTS} attempts: ${String(fetchFailure.error)}. ` +
          `Keeping ${outputs.length} block(s) up to slot ${scannedThrough ?? "-"}; ` +
          `the next poll resumes at ${fetchFailure.slot}.`,
      );
      if (scannedThrough == null) {
        // Nothing at all was resolved, so there is no progress to report and
        // nothing to advance to. Throw: the fetch loop counts it in
        // `consecutiveErrors`, leaves `lastSuccessfulFetchMs` alone and retries
        // this exact range after `pollingInterval`. That is what keeps a
        // genuinely unreachable RPC visible to /health instead of looking idle.
        throw fetchFailure.error;
      }
    }

    if (outputs.length === 0) {
      if (!lastPage) {
        throw new Error(
          `[Solana] Could not fetch any blocks from ${data.from} to ${data.to} and no previous page was found.`,
        );
      }
      // Advance the page even though nothing was found. `stateToInput` derives
      // `from` from `lastPage.own`, so a page that never moves re-requests the
      // same window forever — a range of entirely skipped slots (a Solana
      // outage, or any leaderless stretch) would stall the fetcher permanently
      // with no recovery once blocks resume. This is the "Page != Data"
      // invariant in the package CLAUDE.md: pages track scan progress, not
      // content.
      //
      // The root timestamp is carried over unchanged: no block means no new
      // time to report, and the merge requires root to be non-decreasing.
      //
      // NOTE: near/fetcher.ts:94 has the identical stall — it's the pattern this
      // was copied from. Not fixed here to keep this PR scoped to Solana.
      //
      // `scannedThrough`, not `data.to`: if a fetch failed part-way we must not
      // advance over the slot we never read.
      return {
        output: [],
        lastPage: {
          ...lastPage,
          own: scannedThrough as Page,
          ownBlockNumber: scannedThrough as Page,
        },
      };
    }

    const lastOutput = outputs[outputs.length - 1].output;
    // Page to the highest RESOLVED slot rather than the last one that carried
    // data: trailing skipped slots were positively confirmed empty, so
    // re-scanning them next poll is wasted work. On a clean full scan this is
    // `data.to`, matching bitcoin/evm. The root timestamp still comes from the
    // newest block we actually have, which is what the merge gates on.
    const page = (scannedThrough ?? lastOutput.slot) as Page;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: page,
        own: page,
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }

  /**
   * `getBlock` with a few immediate retries, so a transient RPC blip does not
   * cost the whole chunk.
   *
   * Deliberately BOUNDED. Retrying here forever would look like "we always get
   * the block eventually", but it recreates the exact failure the request
   * timeout was added to kill (sync CLAUDE.md finding #4): `readData` would
   * never return, so the fetch loop never reaches its `catch`,
   * `consecutiveErrors` stays 0, `lastSuccessfulFetchMs` freezes, and /health
   * reports a happy node that has silently stopped producing blocks.
   *
   * Unbounded retry still happens — one level up, where it is observable. The
   * fetch loop re-requests the same range every `pollingInterval` indefinitely,
   * and page ranges are idempotent, so no slot is ever skipped. This helper only
   * decides how much we retry *before* handing that decision back.
   */
  @bound
  *getBlockWithRetry(slot: number) {
    let lastError: unknown;
    let attempt = 0;
    let rateLimited = 0;
    while (attempt < BLOCK_FETCH_ATTEMPTS) {
      yield* this.paceGetBlock();
      try {
        return yield* call(() => this.client.getBlock(slot));
      } catch (error) {
        if (error instanceof SolanaRateLimitError && rateLimited < this.rateLimitRetries) {
          rateLimited++;
          this.rateLimitedWaits++;
          const backoff = Math.min(this.rateLimitMaxBackoffMs, this.rateLimitBackoffMs * 2 ** (rateLimited - 1));
          const wait = Math.max(backoff, error.retryAfterMs ?? 0);
          if (rateLimited === 1 || rateLimited === this.rateLimitRetries) {
            console.warn(
              `[Solana] getBlock(${slot}) rate-limited by the RPC (${rateLimited}/${this.rateLimitRetries}); waiting ${wait} ms. ` +
                `Slow the requests with getBlockMinIntervalMs, or use a faster RPC.`,
            );
          }
          yield* sleep(wait);
          continue;
        }
        attempt++;
        lastError = error;
        if (attempt < BLOCK_FETCH_ATTEMPTS) {
          yield* sleep(BLOCK_FETCH_RETRY_DELAY_MS * attempt);
        }
      }
    }
    throw lastError;
  }

  /** Halve the concurrency after a rate-limited batch; grow it back by one after clean ones. */
  adaptConcurrency(rateLimited: boolean): void {
    if (rateLimited) {
      const next = Math.max(1, Math.floor(this.currentConcurrency / 2));
      if (next !== this.currentConcurrency) {
        console.warn(`[Solana] rate-limited: getBlock concurrency ${this.currentConcurrency} → ${next}.`);
      }
      this.currentConcurrency = next;
      this.cleanBatches = 0;
      return;
    }
    if (this.currentConcurrency >= this.getBlockConcurrency) return;
    if (++this.cleanBatches >= CONCURRENCY_RECOVERY_BATCHES) {
      this.currentConcurrency++;
      this.cleanBatches = 0;
    }
  }

  /** `getBlockWithRetry` that reports its outcome instead of throwing (for concurrent batches). */
  @bound
  *tryGetBlock(slot: number): Operation<{ slot: number; ok: true; block: SolanaBlock | null } | { slot: number; ok: false; error: unknown }> {
    try {
      return { slot, ok: true as const, block: yield* this.getBlockWithRetry(slot) };
    } catch (error) {
      return { slot, ok: false as const, error };
    }
  }

  /** Spaces `getBlock` calls at least `getBlockMinIntervalMs` apart, across concurrent requests. */
  @bound
  *paceGetBlock(): Operation<void> {
    if (this.getBlockMinIntervalMs <= 0) return;
    const now = Date.now();
    const at = Math.max(now, this.nextGetBlockAt);
    this.nextGetBlockAt = at + this.getBlockMinIntervalMs;
    if (at > now) yield* sleep(at - now);
  }

  @bound
  *readPrimitives(
    slot: number,
    block: {
      transactions: {
        transaction: {
          message: { accountKeys: string[] };
          signatures: string[];
        };
        meta: {
          err: unknown | null;
          logMessages: string[] | null;
          postBalances: number[];
          loadedAddresses?: {
            writable: string[];
            readonly: string[];
          } | null;
          postTokenBalances?: SolanaTokenBalance[] | null;
        } | null;
      }[];
    },
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL }
    >[],
  ): Operation<PrimitiveType[]> {
    if (primitiveEntries.length === 0) return [];

    const allPrimitives: PrimitiveType[] = [];

    for (
      let txIndex = 0;
      txIndex < block.transactions.length;
      txIndex++
    ) {
      // One transaction this reader cannot parse (an unexpected shape, e.g. a
      // transaction version newer than the parser knows) is skipped and
      // counted; it never fails the block, so it can never stall the slot.
      // Transactions are judged by their own logs/keys, so the watched
      // program's transactions are read as before.
      try {
        // Collected per transaction, so a transaction that fails half-way adds nothing.
        const txPrimitives: PrimitiveType[] = [];
        const tx = block.transactions[txIndex];
        // A reverted transaction has no on-chain effect: its logs describe work
        // that was rolled back and its postBalances are the pre-state. Emitting
        // primitives for it would drive state transitions off events that never
        // happened. `meta == null` means the RPC couldn't decode the tx — equally
        // unusable, so skip both.
        if (!tx.meta || tx.meta.err) continue;
        // Balances are indexed over static keys PLUS lookup-table addresses, so a
        // watched address pulled in via an ALT is only findable in the resolved
        // list. Legacy transactions resolve to the static keys unchanged.
        const accountKeys = resolveAccountKeys(
          tx.transaction?.message?.accountKeys ?? [],
          tx.meta.loadedAddresses,
        );
        const logs = tx.meta.logMessages ?? [];
        const postBalances = tx.meta.postBalances ?? [];
        const txHash = tx.transaction?.signatures?.[0] ?? "";

        for (const entry of primitiveEntries) {
          const prim = entry.primitive;

          // Dispatch on `prim.type`, NOT on which optional fields happen to be set.
          // `SolanaPrimitive` is a flat bag of optionals, so field-truthy dispatch
          // fails two ways once a third primitive exists: a TokenAccount entry
          // matches no field branch and silently emits nothing, and any field it
          // shares with an earlier branch (`address` being the natural name for a
          // token account) routes it into that branch instead. Neither is a type
          // error. `type` is always populated at runtime because
          // `Primitive.getConfig()` sets it and runtime/src/main.ts replaces the
          // config entry with its output.
          switch (prim.type) {
            // ── SOLANA:AccountBalance — watch an address's lamport balance ──
            case SOLANA_PRIMITIVE_ACCOUNT_BALANCE: {
              if (!prim.address) continue;
              const idx = accountKeys.indexOf(prim.address);
              if (idx === -1) continue;
              txPrimitives.push({
                syncProtocol: {
                  name: entry.syncProtocol,
                  blockNumber: slot,
                  transactionHash: txHash,
                  contractAddress: prim.address,
                  logIndex: txIndex,
                },
                primitive: prim.name,
                output: {
                  payloadType: "solana:balance",
                  payload: {
                    address: prim.address,
                    lamports: postBalances[idx] ?? 0,
                    slot,
                  },
                },
              });
              continue;
            }

            // ── SOLANA:ProgramLog — logs the watched programId actually emitted ──
            case SOLANA_PRIMITIVE_PROGRAM_LOG: {
              if (!prim.programId) continue;
              // Source of truth is the log stream's invoke/success framing, NOT
              // accountKeys: naming a program as an account doesn't invoke it, and
              // a program reached through a lookup table isn't in accountKeys at
              // all. See program-logs.ts.
              const programLogs = extractProgramLogs(logs, prim.programId);
              if (programLogs == null) continue;
              // Filter by eventType if specified — against this program's own lines
              // only, so another program can't trigger it by echoing the string.
              if (prim.eventType) {
                const hasMatchingLog = programLogs.some((log) =>
                  log.includes(prim.eventType!)
                );
                if (!hasMatchingLog) continue;
              }
              txPrimitives.push({
                syncProtocol: {
                  name: entry.syncProtocol,
                  blockNumber: slot,
                  transactionHash: txHash,
                  contractAddress: prim.programId,
                  logIndex: txIndex,
                },
                primitive: prim.name,
                output: {
                  payloadType: "solana:transaction",
                  payload: {
                    programId: prim.programId,
                    slot,
                    logMessages: programLogs,
                  },
                },
              });
              continue;
            }

            // ── SOLANA:TokenAccount — SPL balance of a watched token account ──
            case SOLANA_PRIMITIVE_TOKEN_ACCOUNT: {
              // An entry with no filter would match every token balance on chain.
              // The primitive constructor rejects that, so reaching here means a
              // hand-built config bypassed it.
              if (!prim.mint && !prim.owner && !prim.tokenAccount) {
                this.warnOnce(
                  `[Solana] primitive "${prim.name}" is ${SOLANA_PRIMITIVE_TOKEN_ACCOUNT} with no ` +
                    `mint, owner or tokenAccount — it would match every token balance, so it is skipped.`,
                );
                continue;
              }
              for (const bal of tx.meta.postTokenBalances ?? []) {
                if (prim.mint && bal.mint !== prim.mint) continue;
                if (prim.owner && bal.owner !== prim.owner) continue;
                if (prim.tokenProgramId && bal.programId !== prim.tokenProgramId) {
                  continue;
                }
                // `accountIndex` indexes the RESOLVED list, same as postBalances, so
                // a token account pulled in via a lookup table is only findable here
                // (security fix B3 applied to token balances).
                const tokenAccount = accountKeys[bal.accountIndex];
                if (tokenAccount == null) continue;
                if (prim.tokenAccount && tokenAccount !== prim.tokenAccount) {
                  continue;
                }
                txPrimitives.push({
                  syncProtocol: {
                    name: entry.syncProtocol,
                    blockNumber: slot,
                    transactionHash: txHash,
                    contractAddress: bal.mint,
                    logIndex: txIndex,
                  },
                  primitive: prim.name,
                  output: {
                    payloadType: "solana:token-balance",
                    payload: {
                      tokenAccount,
                      mint: bal.mint,
                      owner: bal.owner ?? "",
                      amount: bal.uiTokenAmount.amount,
                      decimals: bal.uiTokenAmount.decimals,
                      slot,
                    },
                  },
                });
              }
              continue;
            }

            default:
              // A Solana sync protocol carrying a primitive type this fetcher does
              // not implement produced nothing and said nothing before. Warn once
              // per type rather than per transaction, which would be thousands of
              // identical lines during catch-up.
              this.warnOnce(
                `[Solana] primitive "${prim.name}" has unsupported type "${prim.type}" — ignored. ` +
                  `Supported: ${SOLANA_PRIMITIVE_ACCOUNT_BALANCE}, ${SOLANA_PRIMITIVE_PROGRAM_LOG}, ` +
                  `${SOLANA_PRIMITIVE_TOKEN_ACCOUNT}.`,
              );
              continue;
          }
        }
        allPrimitives.push(...txPrimitives);
      } catch (error) {
        this.unparsableTransactions++;
        if (this.unparsableTransactions === 1) {
          console.warn(
            `[Solana] skipped a transaction the reader cannot parse (first at slot ${slot}, tx ${txIndex}: ` +
              `${error instanceof Error ? error.message : String(error)}); such transactions are skipped and counted.`,
          );
        }
      }
    }

    return allPrimitives;
  }
}
