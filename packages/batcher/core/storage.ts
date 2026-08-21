import type { DefaultBatcherInput } from "./types.ts";
import { buildRequestKey } from "./request-id.ts";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isNotFoundError } from "@effectstream/utils/runtime";
import * as fs from "node:fs";

/**
 * Simple async mutex. At most one holder at a time; additional callers
 * queue in FIFO order.
 */
class Mutex {
  private locked = false;
  private queue: (() => void)[] = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

// Custom logger for debugging
// File logging is opt-in: appendFileSync blocks the event loop on every line,
// which is a throughput tax when several adapters share one process.
const FILE_LOGGING_ENABLED = process.env.BATCHER_DEBUG_LOG === "1";

function debugLog(message: string) {
  if (FILE_LOGGING_ENABLED) {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync("batcher-debug.log", `[${timestamp}] ${message}\n`);
    } catch {
      // Ignore if we can't write
    }
  }
  console.log(message);
}

/**
 * Interface for batcher storage operations
 */
export interface BatcherStorage<
  T extends DefaultBatcherInput = DefaultBatcherInput,
> {
  /**
   * Initialize the storage (create directories, tables, etc.).
   *
   * `defaultTarget`, when given, is the target unaddressed input routes to.
   * Implementations that persist a per-row target should use it to stamp rows
   * written before targets were recorded — see `FileStorage.init`.
   */
  init(defaultTarget?: string): Promise<void>;

  /**
   * Add a new input to storage
   */
  addInput(input: T, target: string): Promise<void>;

  /**
   * Get all pending inputs
   */
  getAllInputs(): Promise<T[]>;

  /**
   * Remove specific processed inputs from storage (after successful processing)
   * This ensures we remove exactly the inputs that were processed, not just the first N
   */
  removeProcessedInputs(processedInputs: T[], target: string): Promise<void>;

  /**
   * Get the count of pending inputs
   */
  getInputCountAndSize(): Promise<{ count: number; size: number }>;

  /**
   * Get all pending inputs for a specific target (efficient filtering)
   * @param target - The target adapter name
   * @param defaultTarget - The default target to use when input.target is not specified
   */
  getInputsByTarget(target: string, defaultTarget: string): Promise<T[]>;

  /**
   * Increment the retry count for the given inputs.
   * Inputs whose retry count reaches or exceeds maxRetries are removed from storage.
   *
   * @returns the rows that were DROPPED, each carrying the retry count that
   * caused it. This is the silent-drop fix (spec FR-004): deleting a user's
   * input used to be visible only as a `console.warn`, so a caller holding an
   * open `wait-receipt` request hung until its own timeout for a request that
   * no longer existed. Storage still does not touch callbacks — telling the
   * waiting caller is the processor's job — but it cannot be done at all
   * unless storage says what it dropped.
   */
  incrementRetryCount(
    inputs: T[],
    target: string,
    maxRetries: number,
  ): Promise<T[]>;

  /**
   * Clear all inputs (useful for testing)
   */
  clearAllInputs(): Promise<void>;

  /**
   * Release whatever the backend holds open (database handles, sockets).
   *
   * Optional: a file-backed queue has nothing to release, so it does not
   * implement this. Callers must treat it as optional and call it at shutdown —
   * a backend that keeps a handle open outlives the process that owns it.
   */
  close?(): Promise<void>;
}

/**
 * Lifecycle of a tracked request (spec FR-003).
 *
 * `queued → batching → submitted → confirmed` is the happy path; `failed` is
 * the other ending. `confirmed` and `failed` are TERMINAL — nothing follows
 * them, because a request that reached the chain (or was permanently rejected)
 * cannot un-reach it.
 */
export type RequestState =
  | "queued"
  | "batching"
  | "submitted"
  | "confirmed"
  | "failed";

/** A tracked request as the store currently sees it. */
export interface RequestStatusRecord {
  requestId: string;
  /** The target this request belongs to; part of its identity. */
  target: string;
  address?: string;
  state: RequestState;
  /** True for `confirmed` and `failed`; no transition may follow. */
  terminal: boolean;
  transactionHash?: string;
  blockNumber?: bigint;
  errorCode?: string;
  message?: string;
  retryCount: number;
  replayKey?: string;
  acceptedAt: Date;
  updatedAt: Date;
}

/**
 * What a transition knows beyond its name.
 *
 * Every field is optional and only OVERWRITES when supplied: a `confirmed`
 * that carries no hash keeps the hash `submitted` recorded, rather than
 * erasing the one piece of evidence a caller can act on.
 */
export interface RequestTransitionDetail {
  transactionHash?: string;
  blockNumber?: bigint | number;
  errorCode?: string;
  message?: string;
  retryCount?: number;
}

/** One requested lifecycle move in an ordered bulk status write. */
export interface RequestTransition {
  requestId: string;
  state: RequestState;
  detail?: RequestTransitionDetail;
}

/** Why a transition was refused. Terminal states and backwards moves are not errors — they are answers. */
export type TransitionRefusal =
  | "unknown-request"
  | "regression"
  | "already-terminal";

export type TransitionOutcome =
  | { applied: true; record: RequestStatusRecord }
  | {
    applied: false;
    refused: TransitionRefusal;
    /** The record that stood its ground; absent only for `unknown-request`. */
    current?: RequestStatusRecord;
  };

export interface AcceptanceOutcome {
  /**
   * The request this outcome describes. Normally the id that was passed in —
   * but when `duplicate` is set it is the id of the request that ALREADY owns
   * the replay key, which is the one with a fate to report.
   */
  requestId: string;
  /**
   * False when this id was ALREADY tracked. Ids are deterministic (spec
   * FR-006/Q1-B), so a byte-identical resubmission is the same request; its
   * existing record — which may already be terminal — is left exactly as it
   * was rather than being reset to `queued`.
   */
  created: boolean;
  record: RequestStatusRecord;
  /**
   * The supplied replay key was already claimed, so NOTHING was written: no
   * queue row, no status record (spec FR-006b — the batcher must not pay twice
   * for one signed spend). `requestId` and `record` describe the claimant.
   *
   * This is the replay gate. The claim inside this atomic acceptance is the
   * sole authority: an earlier lookup cannot settle concurrent copies and only
   * adds latency. Absent when no replay key was supplied — there is then
   * nothing to claim and the queue keeps its historical duplicate-rows
   * behaviour.
   */
  duplicate?: boolean;
}

/** What `init()` had to fix up after an unclean stop. */
export interface ReconciliationReport {
  /** Queue rows with no status record: a `queued` status was synthesized (the row wins). */
  synthesizedFromRows: number;
  /**
   * Non-terminal statuses whose queue row is gone. Left exactly as they are:
   * inventing a terminal verdict here would report a failure the chain never
   * gave. Counted so an operator can see it happened.
   */
  orphanedStatuses: number;
}

/**
 * Request tracking — a CAPABILITY of a storage backend, not part of the queue
 * contract.
 *
 * Split out deliberately (plan Q-P2): tracking needs the queue row, the status
 * record and the replay key to move together or not at all, which a database
 * gives for free and two files cannot. `FileStorage` therefore stays exactly as
 * it is — proven, frozen, queue-only — and core code feature-detects tracking
 * with `isTrackingStorage`.
 */
export interface TrackingStorage<
  T extends DefaultBatcherInput = DefaultBatcherInput,
> {
  /**
   * Accept a request: queue the input AND open its status record, atomically.
   *
   * This is the acceptance write — it REPLACES `addInput` for a tracked
   * request, rather than accompanying it. That is the whole point: a caller
   * told "200, tracked" must never be able to find a queue row with no status
   * (unpollable) or a status with no row (a request that will never be sent).
   * One transaction makes the pair impossible to break, including under kill -9.
   */
  recordAccepted(
    requestId: string,
    input: T,
    target: string,
    replayKey?: string,
  ): Promise<AcceptanceOutcome>;

  /**
   * Move a request forward. Append-only: a transition that would move it
   * backwards, or move it at all after a terminal state, is REFUSED and
   * reported (not thrown, not silently applied).
   *
   * This is the crash-replay guard. A batch that confirmed on chain but died
   * before its rows were removed is re-picked on restart; the status must not
   * fall back from `confirmed` to `batching`.
   */
  recordTransition(
    requestId: string,
    state: RequestState,
    detail?: RequestTransitionDetail,
  ): Promise<TransitionOutcome>;

  /**
   * Move several independent requests in one set-based database statement.
   * OPTIONAL: older/custom tracking backends remain valid and the processor
   * falls back to `recordTransition` when this capability is absent.
   */
  recordTransitions?(
    transitions: readonly RequestTransition[],
  ): Promise<TransitionOutcome[]>;

  /** The record for an id, or undefined if this batcher never accepted it (or it aged out). */
  getStatus(requestId: string): Promise<RequestStatusRecord | undefined>;

  /** The record a replay key points at, if any. Plain lookup; the dedup POLICY is not here. */
  findByReplayKey(replayKey: string): Promise<RequestStatusRecord | undefined>;

  /** What the last `init()` reconciled, or undefined if it has not run. */
  getReconciliationReport(): ReconciliationReport | undefined;

  /**
   * Drop terminal records beyond `keepCount` or older than `ttlMs`, and the
   * replay keys that belong to them (spec FR-007).
   *
   * OPTIONAL so that a third-party tracking backend written before this method
   * existed keeps compiling — this is a published package, and the alternative
   * is a fourth breaking interface change for a capability the batcher can
   * feature-detect. A backend that does not implement it simply grows, and the
   * `/queue-stats` retention block reports `enabled: false` rather than
   * claiming a bound it is not enforcing.
   *
   * Retention and replay protection share fate deliberately: the keys are
   * deleted WITH their records, so a request whose record has aged out can be
   * submitted again rather than being permanently refused as a duplicate with
   * nothing left to poll.
   */
  pruneTerminal?(
    keepCount: number,
    ttlMs: number,
  ): Promise<{ prunedByAge: number; prunedByCount: number }>;
}

/**
 * Does this backend track requests?
 *
 * Structural, not `instanceof`: a deployment can supply its own backend, and
 * the question core code needs answered is "can I record status here", not
 * "which class is this".
 */
export function isTrackingStorage<T extends DefaultBatcherInput>(
  storage: BatcherStorage<T>,
): storage is BatcherStorage<T> & TrackingStorage<T> {
  const candidate = storage as Partial<TrackingStorage<T>>;
  return typeof candidate.recordAccepted === "function" &&
    typeof candidate.recordTransition === "function" &&
    typeof candidate.getStatus === "function" &&
    typeof candidate.findByReplayKey === "function";
}

/**
 * File-based storage implementation using JSONL format
 */
export class FileStorage<T extends DefaultBatcherInput = DefaultBatcherInput>
  implements BatcherStorage<T> {
  private readonly filePath: string;
  private readonly dataDirectory: string;
  private readonly mutex = new Mutex();

  constructor(dataDirectory: string = "./batcher-data") {
    mkdirSync(dataDirectory, { recursive: true });
    this.dataDirectory = dataDirectory;
    this.filePath = `${dataDirectory}/pending-inputs.jsonl`;
  }

  /**
   * Write content to the storage file atomically.
   * Writes to a temp file first, then renames (atomic on POSIX).
   */
  private async atomicWrite(content: string): Promise<void> {
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, content);
    await rename(tmpPath, this.filePath);
  }

  async init(defaultTarget?: string): Promise<void> {
    try {
      await mkdir(this.dataDirectory, { recursive: true });
    } catch (error) {
      console.error("Error creating data directory:", error);
      throw new Error(`Failed to initialize storage: ${error}`);
    }
    if (defaultTarget !== undefined) {
      await this.stampLegacyRows(defaultTarget);
    }
  }

  /**
   * One-time migration: give rows written before targets were recorded the
   * target they actually belong to.
   *
   * `createInputKey` falls back to the target currently being processed for a
   * row that has none, so an untargeted row is read as belonging to whoever is
   * asking. A queue carried across an upgrade can therefore have another
   * product's identical row match — and remove or retry-charge — the legacy
   * default-target row. Rewriting them once, under the mutex, ends that.
   */
  private async stampLegacyRows(defaultTarget: string): Promise<void> {
    await this.mutex.run(async () => {
      let content: string;
      try {
        content = await this.readFileContent();
      } catch {
        return; // no queue file yet
      }
      const lines = content.split("\n").filter((line) => line.trim());
      if (lines.length === 0) return;

      let stamped = 0;
      const migrated = lines.map((line) => {
        try {
          const row = JSON.parse(line) as T;
          if (row.target !== undefined) return line;
          stamped += 1;
          return JSON.stringify({ ...row, target: defaultTarget });
        } catch {
          return line; // leave unparseable lines exactly as found
        }
      });
      if (stamped === 0) return;

      await this.atomicWrite(migrated.join("\n") + "\n");
      console.log(
        `[Storage] Stamped ${stamped} legacy input(s) with target "${defaultTarget}" ` +
          `(rows written before per-row targets were recorded).`,
      );
    });
  }

  async addInput(input: T, target?: string): Promise<void> {
    await this.mutex.run(async () => {
      try {
        const existing = await this.readFileContent();
        // Stamp the RESOLVED target onto the row. An input that arrived without
        // one was routed to the default target, and if it is stored targetless
        // then `createInputKey`'s fallback lets whichever product is currently
        // being processed adopt it — so an identical row belonging to another
        // product matches it and gets removed or retry-charged. A row's identity
        // must not depend on who is reading it.
        const row = input.target === undefined && target !== undefined
          ? { ...input, target }
          : input;
        await this.atomicWrite(existing + JSON.stringify(row) + "\n");
      } catch (error) {
        console.error("Error adding input to storage:", error);
        throw new Error(`Failed to add input: ${error}`);
      }
    });
  }

  async getAllInputs(): Promise<T[]> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const lines = content.trim().split("\n").filter((line) => line.trim());
      return lines.flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          console.warn("⚠️ Skipping corrupt line in storage:", line);
          return [];
        }
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        // File doesn't exist yet, return empty array
        return [];
      }
      console.error("Error reading inputs from storage:", error);
      throw new Error(`Failed to read inputs: ${error}`);
    }
  }

  /**
   * Read the raw file content, returning empty string if file doesn't exist.
   */
  private async readFileContent(): Promise<string> {
    try {
      return await readFile(this.filePath, "utf-8");
    } catch (error) {
      if (isNotFoundError(error)) return "";
      throw error;
    }
  }

  async removeProcessedInputs(
    processedInputs: T[],
    target: string,
  ): Promise<void> {
    await this.mutex.run(async () => {
      try {
        debugLog(`[Storage] Removing ${processedInputs.length} inputs for target ${target}`);
        // Create a set of keys for the processed inputs for fast lookup
        const processedKeys = new Set(processedInputs.map((input) => {
          const key = this.createInputKey(input, target);
          debugLog(`[Storage] Key to remove: ${key.substring(0, 100)}...`);
          return key;
        }));

        // Read all current inputs
        const allInputs = await this.getAllInputs();
        debugLog(`[Storage] Total inputs in storage: ${allInputs.length}`);

        // Filter out the processed inputs
        const remainingInputs = allInputs.filter((input) => {
          const key = this.createInputKey(input, target);
          const shouldRemove = processedKeys.has(key);
          if (shouldRemove) {
            debugLog(`[Storage] Found match to remove: ${key.substring(0, 100)}...`);
          }
          return !shouldRemove;
        });

        debugLog(`[Storage] Remaining inputs: ${remainingInputs.length}`);

        // Write the remaining inputs back to the file atomically
        const content = remainingInputs.map((input) => JSON.stringify(input))
          .join("\n");
        await this.atomicWrite(
          content + (remainingInputs.length > 0 ? "\n" : ""),
        );

        const removedCount = allInputs.length - remainingInputs.length;
        if (removedCount !== processedInputs.length) {
          // When storage is empty this is normal for concurrent adapters:
          // a parallel batch already removed these inputs.
          if (allInputs.length === 0) {
            debugLog(
              `[Storage] Inputs already removed (concurrent batch). Expected ${processedInputs.length}, storage was empty.`,
            );
          } else {
            console.warn(
              `⚠️ Expected to remove ${processedInputs.length} inputs, but removed ${removedCount}. Some inputs may have been processed already.`,
            );
          }
        }
      } catch (error) {
        console.error("Error removing processed inputs:", error);
        throw new Error(`Failed to remove processed inputs: ${error}`);
      }
    });
  }

  /**
   * Create a unique key for a DefaultBatcherInput for comparison.
   *
   * The key must use the INPUT's own target. Using the caller's target for
   * every row makes it cancel out of the comparison, so in a multi-product
   * batcher a byte-identical payload submitted to two targets would be treated
   * as one row — and removing/retry-charging one product's input would hit the
   * other product's copy.
   *
   * The `?? target` fallback exists only for rows written before `addInput`
   * started stamping the resolved target. It is deliberately the LAST resort:
   * while it applies, such a row takes on the identity of whichever product is
   * reading it, which is the very collision this key exists to prevent. New
   * rows are always stamped, so the fallback stops applying once a pre-existing
   * queue has drained.
   *
   * The serialization itself lives in `request-id.ts`: the `Batcher`'s
   * receipt-callback key and the request id are the same string, and three
   * copies of a key that must agree byte-for-byte is a bug waiting to happen.
   */
  private createInputKey(input: T, target: string): string {
    return buildRequestKey(input, target);
  }

  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    try {
      const inputs = await this.getAllInputs();
      const size = inputs.reduce(
        (acc, input) => acc + JSON.stringify(input).length,
        0,
      );
      return { count: inputs.length, size };
    } catch (error) {
      console.error("Error getting input count:", error);
      throw new Error(`Failed to get input count: ${error}`);
    }
  }

  async getInputsByTarget(target: string, defaultTarget: string): Promise<T[]> {
    try {
      const allInputs = await this.getAllInputs();
      return allInputs.filter((input) =>
        (input.target || defaultTarget) === target
      );
    } catch (error) {
      console.error("Error getting inputs by target:", error);
      throw new Error(`Failed to get inputs by target: ${error}`);
    }
  }

  async incrementRetryCount(
    inputs: T[],
    target: string,
    maxRetries: number,
  ): Promise<T[]> {
    if (inputs.length === 0) return [];
    return await this.mutex.run(async () => {
      try {
        const allInputs = await this.getAllInputs();
        const keySet = new Set(inputs.map((i) => this.createInputKey(i, target)));
        const updated: T[] = [];
        const dropped: T[] = [];
        for (const input of allInputs) {
          const key = this.createInputKey(input, target);
          if (!keySet.has(key)) {
            updated.push(input);
            continue;
          }
          const newRetryCount = (input.retryCount ?? 0) + 1;
          if (newRetryCount >= maxRetries) {
            // Always-visible: deleting a user's input must never be silent.
            console.warn(
              `[Storage] DROPPING input after ${newRetryCount} failed retries ` +
                `(address=${input.address}, target=${target}): ${key.substring(0, 100)}...`,
            );
            // Reported, not just logged: the caller waiting on this input can
            // only be told it is gone if something tells the batcher first.
            dropped.push({ ...input, retryCount: newRetryCount });
            continue; // drop it from storage
          }
          updated.push({ ...input, retryCount: newRetryCount });
        }
        const content = updated.map((i) => JSON.stringify(i)).join("\n");
        await this.atomicWrite(
          content + (updated.length > 0 ? "\n" : ""),
        );
        return dropped;
      } catch (error) {
        console.error("Error incrementing retry counts:", error);
        throw new Error(`Failed to increment retry counts: ${error}`);
      }
    });
  }

  async clearAllInputs(): Promise<void> {
    try {
      await rm(this.filePath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        console.error("Error clearing inputs:", error);
        throw new Error(`Failed to clear inputs: ${error}`);
      }
      // File doesn't exist, which means it's already cleared
    }
  }
}

/**
 * Database-backed storage (embedded PgLite by default, Postgres on opt-in).
 *
 * Lives in its own module because it carries a schema, a driver abstraction and
 * a legacy-import path; re-exported here so `BatcherStorage`'s implementations
 * stay discoverable from one place.
 */
export { DatabaseStorage } from "./database-storage.ts";
export type { DatabaseStorageOptions } from "./database-storage.ts";
