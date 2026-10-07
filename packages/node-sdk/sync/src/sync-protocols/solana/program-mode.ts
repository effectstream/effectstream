/**
 * Program mode: the Solana sync reads only the watched programs' transactions
 * (AA 00064, contract C1–C10), instead of every block.
 *
 * One poll, every `pollingInterval` (C2, C3):
 *
 *   1. `getSlot(finalized)` → the tip `F` (a root: it never rolls back);
 *   2. `getBlockTime(F)`, stepping back over skipped slots → the progress time;
 *   3. per watched program, `getSignaturesForAddress(program, finalized,
 *      minContextSlot F)`: a first page of 10, then pages of 1000 with `before`
 *      until the page reaches the cursor. Never `until`: an unknown `until`
 *      answers `[]` with no error (R2), which would hide everything;
 *   4. keep the entries with `startBlockHeight ≤ slot ≤ F`, above the cursor,
 *      and `err == null` (entries past `F` wait for the next poll);
 *   5. `getTransaction` for each, oldest first.
 *
 * An idle poll is therefore 3 RPC calls for one program (C10). The outputs are
 * one per slot holding a kept transaction, with the same primitive records as
 * block mode (C4); every merge key is the chain's `blockTime` (C6). A poll
 * succeeds or fails as a whole: a call that still fails after its retries
 * (C7) throws, so neither outputs nor the page change, and the fetch loop
 * counts the error and sleeps.
 *
 * DETERMINISM (C8, spec FR-009): nothing in this file reads a clock. No
 * `Date.now()`, `new Date()` or `performance.now()`: the only time it knows is
 * the chain's `blockTime`, and it waits only with `sleep` timers. The client
 * it uses ignores the HTTP-date form of `Retry-After`. Enforced by
 * `program-mode-determinism.test.ts`.
 */
import { call, sleep, type Operation } from "effection";
import { SOLANA_PRIMITIVE_PROGRAM_LOG } from "@effectstream/config";
import type { DataFetched } from "../base/fetcher.ts";
import type { OutputAndCleanup } from "../base/state.ts";
import type { RootPage } from "../types.ts";
import { applyDelay } from "../common/utils.ts";
import {
  isSkippedSlotError,
  type SolanaClient,
  SolanaRateLimitError,
  type SolanaSignatureInfo,
  type SolanaTransaction,
  type SolanaTransactionWithMeta,
} from "./SolanaClient.ts";
import {
  type Output,
  type Page,
  type PrimitiveEntryType,
  type PrimitiveType,
  type ProgramCursor,
  type SolanaLastPage,
  type SolanaSyncMode,
  toMsTimestamp,
} from "./types.ts";

/** First `getSignaturesForAddress` page of a poll: an idle answer is ≤ 10 entries (~2.4 KB). */
export const FIRST_PAGE_LIMIT = 10;
/** Every later page: the RPC's maximum (1001 → -32602, R2). */
export const PAGE_LIMIT = 1000;
/** Step-back budget over skipped slots for a `blockTime` (C3.2; devnet skips in runs of 4). */
export const MAX_BLOCK_TIME_STEP_BACK = 64;
/** Attempts per call before the poll fails (C7, block mode's `getBlock` rule). */
const CALL_ATTEMPTS = 3;
/** Linear backoff between those attempts (250 ms, then 500 ms). */
const CALL_RETRY_DELAY_MS = 250;
/** An idle summary line every this many polls (≈ 10 min at 6 s); a poll count, never a clock. */
export const IDLE_SUMMARY_EVERY_POLLS = 100;

/** The protocol's mode; anything but `block` / `program` is a start-up error (C1). */
export function syncModeOf(syncProtocol: { mode?: unknown }): SolanaSyncMode {
  const mode = syncProtocol.mode ?? "block";
  if (mode === "block" || mode === "program") return mode;
  throw new Error(`[Solana] unknown sync mode "${String(mode)}" (expected "block" or "program")`);
}

/**
 * The programs program mode watches: the `programId`s of the protocol's
 * `SOLANA:ProgramLog` primitives, deduplicated, at least one (C1, D4).
 *
 * Any other Solana primitive makes program mode refuse to start: a token
 * transfer need not list its mint, and a balance change need not list a
 * watched program, so `getSignaturesForAddress` cannot find every
 * `AccountBalance`/`TokenAccount` change.
 */
export function watchedProgramsOf(protocolName: string, primitives: readonly PrimitiveEntryType[]): string[] {
  const programs: string[] = [];
  for (const entry of primitives) {
    const prim = entry.primitive;
    if (prim.type !== SOLANA_PRIMITIVE_PROGRAM_LOG) {
      throw new Error(
        `[Solana] ${protocolName}: program mode reads only ${SOLANA_PRIMITIVE_PROGRAM_LOG} primitives, ` +
          `but "${prim.name}" is ${String(prim.type)}; use mode "block" for it.`,
      );
    }
    if (!prim.programId) {
      throw new Error(`[Solana] ${protocolName}: primitive "${prim.name}" has no programId.`);
    }
    if (!programs.includes(prim.programId)) programs.push(prim.programId);
  }
  if (programs.length === 0) {
    throw new Error(
      `[Solana] ${protocolName}: program mode needs at least one ${SOLANA_PRIMITIVE_PROGRAM_LOG} primitive to know which program to read.`,
    );
  }
  return programs;
}

/** Whether `entry` is newer than what the cursor already emitted (C5). Exact with or without `transactionIndex`. */
export function isAboveCursor(entry: { slot: number; signature: string }, cursor: ProgramCursor): boolean {
  return entry.slot > cursor.slot || (entry.slot === cursor.slot && !cursor.signatures.includes(entry.signature));
}

/**
 * Each mode refuses the other mode's database (C5, spec FR-007): a program-mode
 * resume marker always carries `cursor`, a block-mode one never does. There is
 * no migration; start the other mode on a new database.
 */
export function assertResumeMarkerMatchesMode(
  mode: SolanaSyncMode,
  protocolName: string,
  page: SolanaLastPage | undefined,
): void {
  if (page == null) return;
  const hasCursor = page.cursor != null;
  if (mode === "program" && !hasCursor) {
    throw new Error(
      `[Solana] ${protocolName}: the database holds a block-mode resume marker (slot ${page.own}, no cursor); ` +
        `program mode cannot resume from it. Start program mode on a new database (no migration exists).`,
    );
  }
  if (mode === "block" && hasCursor) {
    throw new Error(
      `[Solana] ${protocolName}: the database holds a program-mode resume marker (cursor at slot ${page.cursor!.slot}); ` +
        `block mode cannot resume from it. Start block mode on a new database (no migration exists).`,
    );
  }
}

export type ProgramPollerSettings = {
  protocolName: string;
  programs: string[];
  /** The first slot read (inclusive); discovery never goes below it. */
  startBlockHeight: number;
  /** Added to every merge key (`blockTime·1000 + delayMs`), as in block mode. */
  delayMs: number;
  rateLimitRetries: number;
  rateLimitBackoffMs: number;
  rateLimitMaxBackoffMs: number;
};

/** The parser block mode uses (`SolanaFetcher.readPrimitives`), with explicit per-transaction log indexes. */
export type ReadPrimitives = (
  slot: number,
  block: { transactions: SolanaTransaction[] },
  logIndexes: readonly number[],
) => Operation<PrimitiveType[]>;

type Candidate = {
  info: SolanaSignatureInfo;
  program: string;
  /** Position in its slot when the RPC gave no index: the rank in the list's (index) order. */
  rankInSlot: number;
};

type Fetched = Candidate & { tx: SolanaTransactionWithMeta; index: number };

export class SolanaProgramPoller {
  // ── Observability (C9) ──
  /** Polls attempted since start. */
  polls = 0;
  /** Polls that found no new transaction (including those with no tip progress). */
  idlePolls = 0;
  /** Polls that failed as a whole (a call still failing after its retries). */
  failedPolls = 0;
  /** Transactions emitted (kept, fetched and handed to the parser). */
  transactionsEmitted = 0;
  /** Entries found above the cursor but at or below an earlier poll's tip (C5); expected 0. */
  lateSignatures = 0;
  /** Transactions ordered by list position because the RPC gave no `transactionIndex` (C4). */
  indexFallbacks = 0;
  /** 429 waits so far. */
  rateLimitedWaits = 0;
  /** The last successful poll's progress: the tip and the `blockTime` its key came from. */
  progress: { slot: number; blockTime: number; blockTimeSlot: number } | null = null;
  /** The cursor after the last successful poll. */
  cursor: ProgramCursor | null = null;

  private readonly warned = new Set<string>();

  constructor(
    readonly client: SolanaClient,
    readonly settings: ProgramPollerSettings,
    private readonly readPrimitives: ReadPrimitives,
  ) {}

  /** The cursor before the first output: discovery stops at `startBlockHeight`. */
  emptyCursor(): ProgramCursor {
    return { slot: this.settings.startBlockHeight - 1, signatures: [] };
  }

  /** `blockTime·1000 + delayMs`: the same key block mode gives a block (C6). */
  rootOf(blockTime: number): RootPage {
    return applyDelay(toMsTimestamp(blockTime), this.settings.delayMs) as RootPage;
  }

  /**
   * One poll (C3). Succeeds or fails as a whole: on any failure it throws and
   * nothing changes (C7).
   */
  *poll(lastPage: SolanaLastPage | undefined): Operation<DataFetched<Output, Page, RootPage>> {
    this.polls++;
    try {
      return yield* this.pollOnce(lastPage);
    } catch (error) {
      this.failedPolls++;
      throw error;
    }
  }

  private *pollOnce(lastPage: SolanaLastPage | undefined): Operation<DataFetched<Output, Page, RootPage>> {
    const s = this.settings;
    const own = lastPage != null ? Number(lastPage.own) : s.startBlockHeight - 1;

    // C3.1 — the tip. A root, so a block was produced there.
    const tip = yield* this.callRpc("getSlot", () => this.client.getSlot("finalized"));
    if (tip <= own || tip < s.startBlockHeight) {
      // No progress: the poll ends with no other call and no change.
      this.idlePolls++;
      this.maybeIdleSummary();
      return { output: [], lastPage: lastPage as SolanaLastPage };
    }

    // C3.2 — the progress time, from the chain.
    const tipTime = yield* this.blockTimeAtOrBefore(tip);

    // C3.3–C3.5 — discovery.
    const cursor = lastPage?.cursor ?? this.emptyCursor();
    const bySignature = new Map<string, Candidate>();
    for (const program of s.programs) {
      const listed = yield* this.discover(program, tip, cursor);
      // Rank within each slot, oldest first: the list is newest first by
      // (slot, index), so a slot's entries appear in descending index order.
      const perSlot = new Map<number, number>();
      for (const e of listed) perSlot.set(e.slot, (perSlot.get(e.slot) ?? 0) + 1);
      const seenInSlot = new Map<number, number>();
      for (const info of listed) {
        const seen = seenInSlot.get(info.slot) ?? 0;
        seenInSlot.set(info.slot, seen + 1);
        const rankInSlot = perSlot.get(info.slot)! - 1 - seen;
        if (info.slot < s.startBlockHeight || info.slot > tip) continue; // > tip: the next poll's
        if (!isAboveCursor(info, cursor)) continue;
        if (info.err != null) continue; // failed: no on-chain effect, as block mode
        if (!bySignature.has(info.signature)) bySignature.set(info.signature, { info, program, rankInSlot });
      }
    }
    const kept = [...bySignature.values()].sort((a, b) =>
      a.info.slot - b.info.slot || (a.info.transactionIndex ?? a.rankInSlot) - (b.info.transactionIndex ?? b.rankInSlot)
    );

    // C3.6 — the transactions, oldest first.
    const fetched: Fetched[] = [];
    for (const k of kept) {
      const tx = yield* this.callRpc("getTransaction", async () => {
        const result = await this.client.getTransaction(k.info.signature, "finalized");
        if (result == null) {
          throw new Error(`[Solana] getTransaction(${k.info.signature}) returned null for a listed signature`);
        }
        return result;
      });
      // C4 — the index in the block: getTransaction's, else the listing's, else
      // the rank in the RPC's (index) order, with a warning.
      let index = tx.transactionIndex ?? k.info.transactionIndex ?? null;
      if (index == null) {
        index = k.rankInSlot;
        this.indexFallbacks++;
        this.warnOnce(
          "index-fallback",
          `[Solana] ${s.protocolName}: the RPC returned no transactionIndex (first: ${k.info.signature} at slot ${k.info.slot}); ` +
            `ordering within a slot falls back to the RPC's list order, and logIndex may differ from block mode's.`,
        );
      }
      fetched.push({ ...k, tx, index });
    }
    // Ties (only possible with the rank fallback over several programs) break
    // on the signature's code units: deterministic, unlike a locale compare.
    fetched.sort((a, b) =>
      a.info.slot - b.info.slot || a.index - b.index ||
      (a.info.signature < b.info.signature ? -1 : a.info.signature > b.info.signature ? 1 : 0)
    );

    // C4 — one output per slot, in slot order.
    const outputs: OutputAndCleanup<Output>[] = [];
    let nextCursor = cursor;
    let late = 0;
    for (let i = 0; i < fetched.length;) {
      const slot = fetched[i].info.slot;
      const group: Fetched[] = [];
      while (i < fetched.length && fetched[i].info.slot === slot) group.push(fetched[i++]);

      // C5 — an entry at or below an earlier poll's tip turned up late.
      if (lastPage != null && slot <= own) late += group.length;

      // C6 — the key is the chain's blockTime of the slot (getTransaction's),
      // else getBlockTime(slot), stepping back.
      const blockTime = group[0].tx.blockTime ?? (yield* this.blockTimeAtOrBefore(slot)).blockTime;

      const signatures = group.map((g) => g.info.signature);
      nextCursor = nextCursor.slot === slot
        ? { slot, signatures: [...nextCursor.signatures, ...signatures] }
        : { slot, signatures };
      const primitives = yield* this.readPrimitives(
        slot,
        { transactions: group.map((g) => g.tx) },
        group.map((g) => g.index),
      );
      outputs.push({
        output: {
          slot,
          blockhash: signatures[0],
          blockTime,
          blockHeight: null,
          parentSlot: null,
          transactions: group.map((g) => ({
            err: g.tx.meta?.err ?? null,
            logMessages: g.tx.meta?.logMessages ?? null,
            preBalances: g.tx.meta?.preBalances ?? [],
            postBalances: g.tx.meta?.postBalances ?? [],
          })),
          primitives,
          cursor: nextCursor,
        },
        cleanup: () => {},
      });
    }

    // C6 — progress: the tip, keyed by its own blockTime; never below the
    // previous root or an emitted key (all non-decreasing in slot).
    let root = this.rootOf(tipTime.blockTime);
    if (lastPage != null && lastPage.root > root) root = lastPage.root;
    const newest = outputs[outputs.length - 1]?.output;
    if (newest != null && this.rootOf(newest.blockTime) > root) root = this.rootOf(newest.blockTime);

    this.progress = { slot: tip, blockTime: tipTime.blockTime, blockTimeSlot: tipTime.slot };
    this.cursor = nextCursor;
    this.transactionsEmitted += fetched.length;
    if (late > 0) {
      this.lateSignatures += late;
      console.warn(
        `[Solana] ${s.protocolName}: ${late} transaction(s) appeared late (above the cursor but at or below an earlier poll's tip, ` +
          `slot ≤ ${own}); emitted now, exactly once (lateSignatures=${this.lateSignatures}).`,
      );
    }
    if (fetched.length > 0) {
      console.log(
        `[Solana] ${s.protocolName} program poll #${this.polls}: ${fetched.length} transaction(s) in ${outputs.length} slot(s) ` +
          `through slot ${tip} (blockTime ${tipTime.blockTime}); cursor slot ${nextCursor.slot}; ` +
          `calls since start: ${this.client.counters.describe()}`,
      );
    } else {
      this.idlePolls++;
      this.maybeIdleSummary();
    }

    return {
      output: outputs,
      lastPage: { own: tip as Page, ownBlockNumber: tip as Page, root, cursor: nextCursor } as SolanaLastPage,
    };
  }

  /**
   * C3.3 — the program's entries newer than the cursor, newest first: a first
   * page of {@link FIRST_PAGE_LIMIT}, then pages of {@link PAGE_LIMIT} with
   * `before` while a page is full, its oldest entry is above the cursor and at
   * or above `startBlockHeight`. `minContextSlot = tip` keeps a lagging backend
   * from answering (-32016 fails the poll).
   */
  private *discover(program: string, tip: number, cursor: ProgramCursor): Operation<SolanaSignatureInfo[]> {
    const listed: SolanaSignatureInfo[] = [];
    const befores = new Set<string>();
    let before: string | undefined;
    let limit = FIRST_PAGE_LIMIT;
    while (true) {
      const page = yield* this.callRpc("getSignaturesForAddress", () =>
        this.client.getSignaturesForAddress(program, { limit, before, commitment: "finalized", minContextSlot: tip }));
      listed.push(...page);
      if (page.length < limit) return listed;
      const oldest = page[page.length - 1];
      if (!isAboveCursor(oldest, cursor) || oldest.slot < this.settings.startBlockHeight) return listed;
      if (befores.has(oldest.signature)) {
        throw new Error(`[Solana] getSignaturesForAddress(${program}) did not page past ${oldest.signature}`);
      }
      befores.add(oldest.signature);
      before = oldest.signature;
      limit = PAGE_LIMIT;
    }
  }

  /**
   * C3.2 — the `blockTime` at `slot`, or at the nearest earlier produced slot
   * that has one (at most {@link MAX_BLOCK_TIME_STEP_BACK} steps): block mode's
   * last-known-`blockTime` rule. A skipped slot (-32007/-32009) or a null time
   * steps back; -32004 or any other error fails the poll.
   */
  private *blockTimeAtOrBefore(slot: number): Operation<{ slot: number; blockTime: number }> {
    for (let s = slot; s >= slot - MAX_BLOCK_TIME_STEP_BACK && s >= 0; s--) {
      const blockTime = yield* this.callRpc("getBlockTime", () =>
        this.client.getBlockTime(s).catch((e) => {
          if (isSkippedSlotError(e)) return null;
          throw e;
        }));
      if (blockTime != null) return { slot: s, blockTime };
    }
    throw new Error(`[Solana] no blockTime at or within ${MAX_BLOCK_TIME_STEP_BACK} slots below slot ${slot}`);
  }

  /**
   * One RPC call with #942's rules (C7): a 429 waits `Retry-After` (seconds) or
   * a doubling backoff, up to `rateLimitRetries` times, without counting as an
   * attempt; other errors get {@link CALL_ATTEMPTS} attempts, 250 ms then 500 ms
   * apart; then the error fails the poll.
   */
  private *callRpc<T>(method: string, request: () => Promise<T>): Operation<T> {
    let lastError: unknown;
    let attempt = 0;
    let rateLimited = 0;
    while (attempt < CALL_ATTEMPTS) {
      try {
        return yield* call(request);
      } catch (error) {
        if (error instanceof SolanaRateLimitError && rateLimited < this.settings.rateLimitRetries) {
          rateLimited++;
          this.rateLimitedWaits++;
          const backoff = Math.min(
            this.settings.rateLimitMaxBackoffMs,
            this.settings.rateLimitBackoffMs * 2 ** (rateLimited - 1),
          );
          const wait = Math.max(backoff, error.retryAfterMs ?? 0);
          if (rateLimited === 1 || rateLimited === this.settings.rateLimitRetries) {
            console.warn(
              `[Solana] ${method} rate-limited by the RPC (${rateLimited}/${this.settings.rateLimitRetries}); waiting ${wait} ms.`,
            );
          }
          yield* sleep(wait);
          continue;
        }
        attempt++;
        lastError = error;
        if (attempt < CALL_ATTEMPTS) yield* sleep(CALL_RETRY_DELAY_MS * attempt);
      }
    }
    throw lastError;
  }

  private maybeIdleSummary(): void {
    if (this.polls % IDLE_SUMMARY_EVERY_POLLS !== 0) return;
    console.log(
      `[Solana] ${this.settings.protocolName} program mode: ${this.polls} polls (${this.idlePolls} idle, ${this.failedPolls} failed), ` +
        `progress slot ${this.progress?.slot ?? "-"} (blockTime ${this.progress?.blockTime ?? "-"}), ` +
        `cursor slot ${this.cursor?.slot ?? "-"}, ${this.transactionsEmitted} transaction(s), lateSignatures=${this.lateSignatures}; ` +
        `calls since start: ${this.client.counters.describe()}`,
    );
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(message);
  }
}
