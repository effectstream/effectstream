// The replay/dedup gate: the batcher must never PAY TWICE for one signed
// request (spec FR-006b).
//
// The gate sits between validation and the queue write, and the case that
// justifies its existence is the one a content-hash id cannot catch:
//
//   take a signed submission, rewrite its `target` — a field the wallet did not
//   sign — and resubmit. The requestId changes, so request identity says "new
//   request". The signature does not. Without this gate the batcher balances,
//   proves and submits that spend a second time, out of its own dust.
//
// Two layers, deliberately:
//   1. a `findByReplayKey` pre-check in `batchInput`, so the common duplicate
//      never opens a write transaction;
//   2. an atomic claim inside `recordAccepted`, because the pre-check is a
//      read and two concurrent copies of one request both pass it. The claim is
//      the truth; the pre-check is only an optimisation.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import type { Batcher } from "../core/batcher.ts";
import { DatabaseStorage, FileStorage } from "../core/storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import { defaultReplayKey } from "../core/replay-key.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const TARGET = "product-a";
const OTHER = "product-b";

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: "1754350000000",
  signature: "0xsignature-1",
  target: TARGET,
  ...overrides,
});

interface Script {
  /** Override the adapter's replay-key extraction; omitted = no hook at all. */
  getReplayKey?: (input: DefaultBatcherInput) => string | undefined;
  hasReplayKeyHook?: boolean;
}

function stubAdapter(script: Script) {
  const adapter: Record<string, unknown> = {
    verifySignature: () => true,
    validateInput: async () => ({ valid: true }),
    buildBatchData: (inputs: DefaultBatcherInput[]) => ({
      selectedInputs: inputs,
      data: { inputs },
    }),
    estimateBatchFee: () => "0",
    submitBatch: async () => "0xbatch",
    waitForTransactionReceipt: async () => ({
      hash: "0xbatch",
      blockNumber: 4242n,
      status: 1,
    }),
    getChainName: () => "stub",
    isReady: () => true,
  };
  if (script.hasReplayKeyHook) {
    adapter.getReplayKey = script.getReplayKey ?? (() => undefined);
  }
  return adapter;
}

async function withBatcher(
  fn: (ctx: {
    batcher: Batcher<DefaultBatcherInput>;
    storage: DatabaseStorage;
  }) => Promise<void>,
  script: Script = {},
  targets: string[] = [TARGET],
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-dedup-gate-"));
  const storage = new DatabaseStorage({ dataDirectory: dir });
  const batcher = createNewBatcher(
    {
      pollingIntervalMs: 1_000_000,
      enableHttpServer: false,
      enableEventSystem: false,
    },
    storage as any,
  );
  for (const target of targets) {
    batcher.addBlockchainAdapter(
      target,
      stubAdapter(script) as unknown as Parameters<
        Batcher<DefaultBatcherInput>["addBlockchainAdapter"]
      >[1],
      { criteriaType: "size", maxBatchSize: 1 },
    );
  }
  try {
    await batcher.init({ startPolling: false });
    await fn({ batcher: batcher as Batcher<DefaultBatcherInput>, storage });
  } finally {
    await storage.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the replay gate at the accept path", () => {
  test("a byte-identical resubmission is not queued twice", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();

      const first = await batcher.batchInput(payload, "no-wait");
      const second = await batcher.batchInput(payload, "no-wait");

      expect(second.requestId).toBe(first.requestId);
      expect(second.duplicate).toBe(true);
      // The whole point: one row, so one balance, one proof, one fee.
      expect((await storage.getAllInputs()).length).toBe(1);
    });
  });

  test("the FIRST submission is not marked duplicate", async () => {
    await withBatcher(async ({ batcher }) => {
      const first = await batcher.batchInput(input(), "no-wait");
      // A caller must be able to tell "we did this" from "we already had it".
      expect(first.duplicate).toBeFalsy();
    });
  });

  test("REGRESSION: a replayed signature with a rewritten target is caught", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const original = input({ target: TARGET });
      const replayed = input({ target: OTHER });

      const first = await batcher.batchInput(original, "no-wait");
      const second = await batcher.batchInput(replayed, "no-wait");

      // Different requestIds — target is part of request identity — but the
      // SAME spend, because the signature is the part that was not rewritten.
      expect(computeRequestId(replayed, OTHER)).not.toBe(first.requestId);
      expect(second.duplicate).toBe(true);
      // The caller gets the ORIGINAL request's id, which is the one that has a
      // fate to report; the id its own payload hashes to never existed.
      expect(second.requestId).toBe(first.requestId);
      expect((await storage.getAllInputs()).length).toBe(1);
    }, {}, [TARGET, OTHER]);
  });

  test("a duplicate of a CONFIRMED request is still a duplicate", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();
      const first = await batcher.batchInput(payload, "no-wait");
      await storage.recordTransition(first.requestId, "confirmed", {
        transactionHash: "0xdone",
        blockNumber: 9n,
      });
      await storage.clearAllInputs();

      const second = await batcher.batchInput(payload, "no-wait");

      // Terminal-within-retention counts: the spend was already paid for, and
      // the caller is told which request answers for it.
      expect(second.duplicate).toBe(true);
      expect(second.requestId).toBe(first.requestId);
      expect(await storage.getAllInputs()).toEqual([]);
    });
  });

  test("once the record is pruned, the same request is accepted anew", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();
      const first = await batcher.batchInput(payload, "no-wait");
      await storage.recordTransition(first.requestId, "confirmed", {
        transactionHash: "0xdone",
      });
      await storage.clearAllInputs();
      // Retention and replay protection share fate (spec FR-007): when the
      // record goes, so does the dedup key, and the batcher has no basis to
      // refuse the work.
      await storage.pruneTerminal(0, 1);

      const second = await batcher.batchInput(payload, "no-wait");

      expect(second.duplicate).toBeFalsy();
      expect((await storage.getAllInputs()).length).toBe(1);
    });
  });

  test("a duplicate gets no-wait semantics even when it asked to wait", async () => {
    await withBatcher(async ({ batcher }) => {
      const payload = input();
      await batcher.batchInput(payload, "no-wait");

      const started = Date.now();
      const second = await batcher.batchInput(payload, "wait-receipt", 60_000);

      // The callbacks map holds ONE waiter per content key. Registering a
      // second would evict the first and starve it silently, so a duplicate
      // returns immediately with its id instead of joining the wait.
      expect(second.duplicate).toBe(true);
      expect(second.receipt).toBeNull();
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  }, { timeout: 30_000 });

  test("concurrent identical submissions still queue exactly once", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();

      // Every one of these passes the `findByReplayKey` pre-check before any
      // of them has written. Only the atomic claim inside the acceptance
      // transaction can stop the rest.
      const results = await Promise.all(
        Array.from({ length: 8 }, () => batcher.batchInput(payload, "no-wait")),
      );

      expect((await storage.getAllInputs()).length).toBe(1);
      expect(new Set(results.map((r) => r.requestId)).size).toBe(1);
      expect(results.filter((r) => r.duplicate === true).length).toBe(7);
    });
  });

  test("inputs with no derivable replay key are admitted, not refused", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      // No signature and no adapter hook: nothing to key on. Refusing here
      // would break every custom adapter written before the hook existed.
      const payload = input({ signature: undefined });
      const a = await batcher.batchInput(payload, "no-wait");
      const b = await batcher.batchInput({ ...payload, timestamp: "2" }, "no-wait");

      expect(a.duplicate).toBeFalsy();
      expect(b.duplicate).toBeFalsy();
      expect((await storage.getAllInputs()).length).toBe(2);
    });
  });

  test("an adapter hook that declines a key disables dedup for that input", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      // The adapter implements the hook and answers `undefined`: authoritative.
      // The signature default must NOT be reinstated behind its back.
      const payload = input();
      await batcher.batchInput(payload, "no-wait");
      const second = await batcher.batchInput(payload, "no-wait");

      expect(second.duplicate).toBeFalsy();
      expect((await storage.getAllInputs()).length).toBe(2);
    }, { hasReplayKeyHook: true, getReplayKey: () => undefined });
  });

  test("an adapter hook's key is what dedup is keyed on", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      // Two payloads that share nothing the core could see, which the adapter
      // says are the same spend.
      const a = input({ timestamp: "1", signature: "0xsig-a" });
      const b = input({ timestamp: "2", signature: "0xsig-b" });

      const first = await batcher.batchInput(a, "no-wait");
      const second = await batcher.batchInput(b, "no-wait");

      expect(second.duplicate).toBe(true);
      expect(second.requestId).toBe(first.requestId);
      expect((await storage.getAllInputs()).length).toBe(1);
    }, { hasReplayKeyHook: true, getReplayKey: () => "one-spend" });
  });

  test("different spends are never confused for each other", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      await batcher.batchInput(input({ signature: "0xsig-a" }), "no-wait");
      const other = await batcher.batchInput(
        input({ signature: "0xsig-b" }),
        "no-wait",
      );

      expect(other.duplicate).toBeFalsy();
      expect((await storage.getAllInputs()).length).toBe(2);
    });
  });

  test("a rejected submission claims no replay key", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();
      const adapter = (batcher as unknown as {
        adapters: Record<string, Record<string, unknown>>;
      }).adapters[TARGET];
      adapter.validateInput = async () => ({ valid: false, error: "no" });

      await expect(batcher.batchInput(payload, "no-wait")).rejects.toThrow(/no/);

      // Nothing was accepted, so nothing may be blocked later: the key must be
      // free for the corrected resubmission.
      expect(await storage.findByReplayKey(defaultReplayKey(payload)!))
        .toBeUndefined();
      adapter.validateInput = async () => ({ valid: true });
      expect((await batcher.batchInput(payload, "no-wait")).duplicate)
        .toBeFalsy();
    });
  });
});

describe("the replay gate without a tracking backend", () => {
  test("FileStorage keeps accepting duplicates, exactly as before", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-dedup-untracked-"));
    const storage = new FileStorage(dir);
    const batcher = createNewBatcher(
      {
        pollingIntervalMs: 1_000_000,
        enableHttpServer: false,
        enableEventSystem: false,
      },
      storage as any,
    );
    batcher.addBlockchainAdapter(
      TARGET,
      stubAdapter({}) as unknown as Parameters<
        Batcher<DefaultBatcherInput>["addBlockchainAdapter"]
      >[1],
      { criteriaType: "size", maxBatchSize: 1 },
    );
    try {
      await batcher.init({ startPolling: false });
      const payload = input();

      // A backend with nowhere to record replay keys cannot dedup. It must
      // behave exactly as it did before the gate existed rather than refuse
      // work it has no basis to call duplicate.
      const first = await batcher.batchInput(payload, "no-wait");
      const second = await batcher.batchInput(payload, "no-wait");

      expect(first.duplicate).toBeFalsy();
      expect(second.duplicate).toBeFalsy();
      expect((await storage.getAllInputs()).length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the atomic claim in the storage layer", () => {
  const withStorage = async (
    fn: (storage: DatabaseStorage) => Promise<void>,
  ): Promise<void> => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-dedup-storage-"));
    const storage = new DatabaseStorage({ dataDirectory: dir });
    try {
      await storage.init(TARGET);
      await fn(storage);
    } finally {
      await storage.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("a second request claiming a taken key writes NOTHING", async () => {
    await withStorage(async (storage) => {
      const a = input({ target: TARGET });
      const b = input({ target: OTHER });
      const idA = computeRequestId(a, TARGET);
      const idB = computeRequestId(b, OTHER);

      await storage.recordAccepted(idA, a, TARGET, "one-spend");
      const outcome = await storage.recordAccepted(idB, b, OTHER, "one-spend");

      expect(outcome.duplicate).toBe(true);
      expect(outcome.created).toBe(false);
      // It reports the request that OWNS the key, not the one that asked.
      expect(outcome.requestId).toBe(idA);
      expect(outcome.record.requestId).toBe(idA);
      // No row, no status: the rejected claimant left no trace at all.
      expect((await storage.getAllInputs()).length).toBe(1);
      expect(await storage.getStatus(idB)).toBeUndefined();
    });
  });

  test("re-claiming your OWN key is a duplicate, not a second row", async () => {
    await withStorage(async (storage) => {
      const payload = input();
      const id = computeRequestId(payload, TARGET);

      await storage.recordAccepted(id, payload, TARGET, "one-spend");
      const outcome = await storage.recordAccepted(id, payload, TARGET, "one-spend");

      expect(outcome.duplicate).toBe(true);
      expect(outcome.requestId).toBe(id);
      expect((await storage.getAllInputs()).length).toBe(1);
    });
  });

  test("a key whose record is gone is a tombstone, not a veto", async () => {
    await withStorage(async (storage) => {
      // A replay key pointing at a request that no longer has a status record
      // has nothing to report. Refusing work on the strength of it would mean
      // a request that can never be submitted AND can never be polled.
      const db = (storage as unknown as {
        db: { query(sql: string, params?: unknown[]): Promise<unknown[]> };
      }).db;
      await db.query(
        "INSERT INTO replay_keys (replay_key, request_id, row_target) VALUES ($1, $2, $3)",
        ["one-spend", "f".repeat(64), TARGET],
      );

      const payload = input();
      const id = computeRequestId(payload, TARGET);
      const outcome = await storage.recordAccepted(id, payload, TARGET, "one-spend");

      expect(outcome.duplicate).toBeFalsy();
      expect(outcome.created).toBe(true);
      expect((await storage.getAllInputs()).length).toBe(1);
      // …and the live request now owns the key, so the NEXT resubmission is
      // still caught. A tombstone must not leave the key unclaimable forever.
      expect((await storage.findByReplayKey("one-spend"))?.requestId).toBe(id);
    });
  });

  test("acceptance without a replay key is untouched by the claim", async () => {
    await withStorage(async (storage) => {
      const payload = input();
      const id = computeRequestId(payload, TARGET);

      const first = await storage.recordAccepted(id, payload, TARGET);
      const second = await storage.recordAccepted(id, payload, TARGET);

      // Phase 2's semantics stand where there is no key to claim: the record
      // is kept, and the queue takes the second row.
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.duplicate).toBeFalsy();
      expect((await storage.getAllInputs()).length).toBe(2);
    });
  });
});
