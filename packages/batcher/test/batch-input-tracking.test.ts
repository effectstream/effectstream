// What a caller gets back when the batcher accepts an input.
//
// The spec's promise is "a 200 means tracked" (FR-001), and the sharp edge is
// the `no-wait` + immediate-poll race: the status record must exist BEFORE
// `batchInput` returns, or a client that polls the instant it gets its id sees
// a 404 for a request that was accepted. These cases pin that, and the two
// halves of the promise around it:
//
//  - an id comes back at EVERY confirmation level, including `no-wait`, where
//    there is no receipt to hang it on;
//  - a REJECTED submission mints nothing at all — no id, no record, no row.
//
// Also covered here because it is the thing most likely to break silently: a
// `wait-receipt` caller still gets its receipt after the receipt-callback key
// was rerouted through the shared request-key builder.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import type { Batcher } from "../core/batcher.ts";
import { DatabaseStorage, FileStorage } from "../core/storage.ts";
import { computeRequestId } from "../core/request-id.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

// Fresh: the admission window (spec FR-011) refuses a signed timestamp older
// than `maxInputAgeMs`, so a fixture pinned to a fixed instant would fail for
// a reason it is not about. Read once, so ids stay stable within a run.
const FRESH = String(Date.now());

const TARGET = "product-a";

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: FRESH,
  signature: "sig-1",
  target: TARGET,
  ...overrides,
});

interface AdapterScript {
  /** Adapter verdict for `validateInput`; valid by default. */
  validation?: unknown;
  /** Receipt the batch confirms with. */
  receipt?: Record<string, unknown>;
}

function stubAdapter(script: AdapterScript = {}) {
  return {
    // Signature verification is stubbed true: these cases are about what
    // happens AFTER an input is accepted, and a real signature would only add
    // a way for them to fail for an unrelated reason.
    verifySignature: () => true,
    validateInput: async () => script.validation ?? { valid: true },
    buildBatchData: (inputs: DefaultBatcherInput[]) => ({
      selectedInputs: inputs,
      data: { inputs },
    }),
    estimateBatchFee: () => "0",
    submitBatch: async () => "0xbatch",
    waitForTransactionReceipt: async () =>
      script.receipt ?? { hash: "0xbatch", blockNumber: 4242n, status: 1 },
    getChainName: () => "stub",
    isReady: () => true,
  };
}

async function withBatcher(
  fn: (ctx: {
    batcher: Batcher<DefaultBatcherInput>;
    storage: DatabaseStorage;
  }) => Promise<void>,
  script: AdapterScript = {},
  targets: string[] = [TARGET],
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-input-tracking-"));
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

describe("batchInput acceptance", () => {
  test("no-wait comes back with an id whose status is ALREADY queued", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();

      const result = await batcher.batchInput(payload, "no-wait");

      // The id is the deterministic one a client can recompute (FR-006).
      expect(result.requestId).toBe(computeRequestId(payload, TARGET));
      expect(result.receipt).toBeNull();
      // The race the spec calls out: no poll, no sleep, no second await — if
      // the record were written after the return, this would be a 404 for an
      // id the caller was just handed.
      const status = await storage.getStatus(result.requestId);
      expect(status?.state).toBe("queued");
      expect(status?.target).toBe(TARGET);
      expect((await storage.getAllInputs()).length).toBe(1);
    });
  });

  test("a rejected submission mints nothing", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();

      await expect(batcher.batchInput(payload, "no-wait")).rejects.toThrow(
        /not today/,
      );

      // FR-001: nothing was accepted, so there is nothing to track — no
      // status a poller could find, and no row a batch could pick up.
      expect(await storage.getStatus(computeRequestId(payload, TARGET)))
        .toBeUndefined();
      expect(await storage.getAllInputs()).toEqual([]);
    }, { validation: { valid: false, error: "not today" } });
  }, { timeout: 30_000 });

  test("wait-receipt carries the id AND the receipt", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      const payload = input();

      const pending = batcher.batchInput(payload, "wait-receipt", 20_000);
      // Give the acceptance write time to land before the batch is driven.
      await Bun.sleep(50);
      await batcher.pollBatcher();
      const result = await pending;

      expect(result.requestId).toBe(computeRequestId(payload, TARGET));
      expect(result.receipt?.hash).toBe("0xbatch");
      // The receipt-callback key now comes from the shared builder. If it had
      // drifted from the key the processor computes off the stored row, this
      // promise would hang until its timeout instead of resolving.
      expect(result.receipt?.blockNumber).toBe(4242n);
      expect(await storage.getAllInputs()).toEqual([]);
    });
  }, { timeout: 30_000 });

  test("two targets, two ids, two independent records", async () => {
    await withBatcher(async ({ batcher, storage }) => {
      // Two SIGNATURES, because that is what two genuine submissions look
      // like: the default signing message includes the target, so a wallet
      // addressing two products signs twice. Reusing one signature across
      // targets is the replay the Phase 3 gate exists to catch — covered in
      // `dedup-gate.test.ts`, and deliberately not conflated with this case.
      const a = await batcher.batchInput(
        input({ target: TARGET, signature: "sig-for-product-a" }),
        "no-wait",
      );
      const b = await batcher.batchInput(
        input({ target: "product-b", signature: "sig-for-product-b" }),
        "no-wait",
      );

      expect(b.requestId).not.toBe(a.requestId);
      expect(b.duplicate).toBeFalsy();
      expect((await storage.getStatus(a.requestId))?.target).toBe(TARGET);
      expect((await storage.getStatus(b.requestId))?.target).toBe("product-b");
    }, {}, [TARGET, "product-b"]);
  });
});

describe("batchInput without a tracking backend", () => {
  test("FileStorage still queues the input and still returns an id", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-input-untracked-"));
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
      stubAdapter() as unknown as Parameters<
        Batcher<DefaultBatcherInput>["addBlockchainAdapter"]
      >[1],
      { criteriaType: "size", maxBatchSize: 1 },
    );
    try {
      await batcher.init({ startPolling: false });
      const payload = input();

      // Q-P2: FileStorage stays queue-only. Accepting an input must not throw
      // just because the backend cannot remember what happened to it — the id
      // is still computed and returned; only the RECORD is missing, and the
      // server refuses to advertise polling for it (Phase 4).
      const result = await batcher.batchInput(payload, "no-wait");

      expect(result.requestId).toBe(computeRequestId(payload, TARGET));
      expect(result.receipt).toBeNull();
      expect((await storage.getAllInputs()).length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
