// FR-3: never record RETRIES_EXHAUSTED for a transaction that is on chain.
//
// This is 00020's M13 in miniature. A batcher is restarted while a batch is in
// flight; the transactions land, but the receipts never come back, so the rows
// survive. They are re-picked, the resubmission is refused because the spends
// are already used, three retries are charged, the rows are dropped — and the
// tracking store publishes `failed / RETRIES_EXHAUSTED` for four requests the
// chain CONFIRMED. Pollers are then told the exact opposite of what happened.
//
// The fix asks before it charges: an input whose earlier submission is findable
// on chain is confirmed, removed and resolved instead. The adapter owns the
// "did it land" question, because only it knows what its payloads mean.

import { describe, expect, test } from "bun:test";
import {
  BatchProcessor,
  ONCHAIN_FAILED,
  RETRIES_EXHAUSTED,
} from "../core/batch-processor.ts";
import { computeRequestId } from "../core/request-id.ts";
import type {
  RequestState,
  RequestStatusRecord,
  RequestTransitionDetail,
  TransitionOutcome,
} from "../core/storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import type {
  BatchSubmitResult,
  BlockchainAdapter,
  BlockchainTransactionReceipt,
  LandedTransaction,
} from "../adapters/adapter.ts";

const TARGET = "product-a";

function makeInput(address: string): DefaultBatcherInput {
  return {
    addressType: 1 as DefaultBatcherInput["addressType"],
    input: `input-from-${address}`,
    address,
    timestamp: "2026-08-25T00:00:00.000Z",
    target: TARGET,
  };
}

interface Recorded {
  requestId: string;
  state: RequestState;
  detail?: RequestTransitionDetail;
}

interface HarnessOptions {
  /** Pre-existing status records, keyed by request id — the pre-restart state. */
  statuses?: Map<string, Partial<RequestStatusRecord>>;
  /** Drop `getStatus` entirely: a tracking backend that predates this method. */
  withoutGetStatus?: boolean;
  /** Make the status lookup blow up. */
  statusError?: Error;
  /** Make row removal blow up. */
  removeError?: Error;
  /** Which inputs storage drops when charged a retry. */
  dropOnRetry?: (inputs: DefaultBatcherInput[]) => DefaultBatcherInput[];
}

function makeHarness(options: HarnessOptions = {}) {
  const recorded: Recorded[] = [];
  const removed: DefaultBatcherInput[] = [];
  const charged: DefaultBatcherInput[] = [];
  /** Every step in order, so ordering claims are measured and not asserted twice. */
  const journal: string[] = [];
  const settled = new Map<string, { status: "resolved" | "rejected"; value: any }>();
  const callbacks = new Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();

  const storage: Record<string, unknown> = {
    removeProcessedInputs: async (inputs: DefaultBatcherInput[]) => {
      if (options.removeError) throw options.removeError;
      journal.push(`remove:${inputs.map((i) => i.address).join("+")}`);
      removed.push(...inputs);
    },
    incrementRetryCount: async (inputs: DefaultBatcherInput[]) => {
      journal.push(`charge:${inputs.map((i) => i.address).join("+")}`);
      charged.push(...inputs);
      return options.dropOnRetry?.(inputs) ?? [];
    },
    recordTransition: async (
      requestId: string,
      state: RequestState,
      detail?: RequestTransitionDetail,
    ): Promise<TransitionOutcome> => {
      journal.push(`record:${state}`);
      recorded.push({ requestId, state, detail });
      return {
        applied: true,
        record: { requestId, state } as RequestStatusRecord,
      };
    },
  };
  if (!options.withoutGetStatus) {
    storage.getStatus = async (
      requestId: string,
    ): Promise<RequestStatusRecord | undefined> => {
      if (options.statusError) throw options.statusError;
      journal.push("getStatus");
      const found = options.statuses?.get(requestId);
      return found === undefined
        ? undefined
        : { requestId, state: "submitted", ...found } as RequestStatusRecord;
    };
  }

  const processor = new BatchProcessor<DefaultBatcherInput>({
    emitStateTransition: async () => {},
    // deno-lint-ignore no-explicit-any
    storage: storage as any,
    submissionCallbacks: callbacks,
    waitForEffectStreamProcessed: async () => null,
    getCallbackKey: (input) => input.address,
    getRetryPolicy: () => ({ maxRetries: 3, retryDelayMs: 10 }),
    setTargetCooldown: () => {},
  });

  const waitOn = (input: DefaultBatcherInput) => {
    const key = input.address;
    const promise = new Promise<{ ok?: unknown; err?: unknown }>((resolve) => {
      callbacks.set(key, {
        resolve: (value) => {
          settled.set(key, { status: "resolved", value });
          resolve({ ok: value });
        },
        reject: (value) => {
          settled.set(key, { status: "rejected", value });
          resolve({ err: value });
        },
        timeoutId: setTimeout(() => {}, 60_000),
      });
    });
    return promise;
  };

  const statesOf = (input: DefaultBatcherInput) =>
    recorded
      .filter((r) => r.requestId === computeRequestId(input, TARGET))
      .map((r) => r.state);
  const detailOf = (input: DefaultBatcherInput, state: RequestState) =>
    recorded.find((r) =>
      r.requestId === computeRequestId(input, TARGET) && r.state === state
    )?.detail;

  return {
    processor,
    recorded,
    removed,
    charged,
    journal,
    settled,
    waitOn,
    statesOf,
    detailOf,
  };
}

/**
 * An adapter whose submission FAILS for every input — the post-restart shape —
 * and which can answer whether that input's earlier attempt is on chain.
 */
function makeAdapter(
  inputs: DefaultBatcherInput[],
  landed: Map<string, LandedTransaction>,
  options: {
    findError?: Error;
    withoutHook?: boolean;
    throwInstead?: Error;
    seenContexts?: Array<{ address: string; transactionHash?: string }>;
  } = {},
): BlockchainAdapter<any> {
  const submit = async (): Promise<BatchSubmitResult<DefaultBatcherInput>> => {
    if (options.throwInstead) throw options.throwInstead;
    return {
      failed: inputs.map((input) => ({
        input,
        error: "Transaction submission error",
      })),
    };
  };

  const adapter: BlockchainAdapter<any> = {
    buildBatchData: () => ({
      selectedInputs: inputs,
      data: { selectedInputs: [...inputs] },
    }),
    estimateBatchFee: () => "1",
    submitBatch: submit,
    waitForTransactionReceipt: async (): Promise<
      BlockchainTransactionReceipt
    > => {
      throw new Error("no receipt should ever be awaited in these cases");
    },
    getAccountAddress: () => "batcher",
    getChainName: () => "test",
    isReady: () => true,
    getBlockNumber: async () => 1n,
  };

  if (!options.withoutHook) {
    adapter.findLandedTransaction = async (input, context) => {
      options.seenContexts?.push({
        address: input.address,
        transactionHash: context.transactionHash,
      });
      if (options.findError) throw options.findError;
      return landed.get(input.address);
    };
  }
  return adapter;
}

describe("FR-3 — a request whose transaction landed is never retry-exhausted", () => {
  test("M13's shape: the landed input is confirmed, removed and resolved — not charged", async () => {
    const landed = makeInput("landed");
    const h = makeHarness({
      statuses: new Map([[computeRequestId(landed, TARGET), {
        transactionHash: "0xearlier",
      }]]),
    });
    const waiting = h.waitOn(landed);
    const adapter = makeAdapter([landed], new Map([
      ["landed", { hash: "0xearlier", blockNumber: 4242n, status: 1 }],
    ]));

    await h.processor.processBatchForTarget(adapter, TARGET, [landed]);

    // The whole point: nothing was charged, so nothing can ever be dropped.
    expect(h.charged).toEqual([]);
    expect(h.statesOf(landed)).toEqual(["batching", "confirmed"]);
    expect(h.detailOf(landed, "confirmed")).toEqual({
      transactionHash: "0xearlier",
      blockNumber: 4242n,
    });
    expect(h.removed).toEqual([landed]);
    const settled = await waiting;
    expect(settled.err).toBeUndefined();
    expect((settled.ok as BlockchainTransactionReceipt).hash).toBe("0xearlier");
    expect((settled.ok as BlockchainTransactionReceipt).blockNumber).toBe(4242n);
  });

  test("the verdict is written BEFORE the row is removed (00011 F-P3.14)", async () => {
    const landed = makeInput("landed");
    const h = makeHarness();
    const adapter = makeAdapter([landed], new Map([
      ["landed", { hash: "0xearlier", blockNumber: 7n }],
    ]));

    await h.processor.processBatchForTarget(adapter, TARGET, [landed]);

    // Under kill -9 record-then-remove leaves `confirmed` with a surviving row,
    // which the append-only guard repairs on the next pick. Remove-then-record
    // leaves an orphaned in-flight record nothing will ever resolve.
    const confirmedAt = h.journal.indexOf("record:confirmed");
    const removedAt = h.journal.indexOf("remove:landed");
    expect(confirmedAt).toBeGreaterThanOrEqual(0);
    expect(removedAt).toBeGreaterThanOrEqual(0);
    expect(confirmedAt).toBeLessThan(removedAt);
  });

  test("the adapter is handed the hash the earlier submission recorded", async () => {
    const landed = makeInput("landed");
    const seenContexts: Array<{ address: string; transactionHash?: string }> = [];
    const h = makeHarness({
      statuses: new Map([[computeRequestId(landed, TARGET), {
        transactionHash: "0xrecorded",
      }]]),
    });
    const adapter = makeAdapter([landed], new Map(), { seenContexts });

    await h.processor.processBatchForTarget(adapter, TARGET, [landed]);

    expect(seenContexts).toEqual([{
      address: "landed",
      transactionHash: "0xrecorded",
    }]);
  });

  test("only the landed input is spared; its neighbours still pay", async () => {
    const landed = makeInput("landed");
    const lost = makeInput("lost");
    const h = makeHarness();
    const adapter = makeAdapter([landed, lost], new Map([
      ["landed", { hash: "0xearlier", blockNumber: 9n }],
    ]));

    await h.processor.processBatchForTarget(adapter, TARGET, [landed, lost]);

    expect(h.removed).toEqual([landed]);
    expect(h.charged).toEqual([lost]);
    expect(h.statesOf(landed)).toEqual(["batching", "confirmed"]);
    expect(h.statesOf(lost)).toEqual(["batching"]);
  });

  test("a transaction the chain mined and FAILED is recorded ONCHAIN_FAILED, not exhausted", async () => {
    const reverted = makeInput("reverted");
    const h = makeHarness();
    const waiting = h.waitOn(reverted);
    const adapter = makeAdapter([reverted], new Map([
      ["reverted", { hash: "0xreverted", blockNumber: 11n, status: 0 }],
    ]));

    await h.processor.processBatchForTarget(adapter, TARGET, [reverted]);

    expect(h.charged).toEqual([]);
    expect(h.detailOf(reverted, "failed")?.errorCode).toBe(ONCHAIN_FAILED);
    expect(h.detailOf(reverted, "failed")?.errorCode).not.toBe(
      RETRIES_EXHAUSTED,
    );
    const settled = await waiting;
    expect((settled.err as Error).message).toContain("0xreverted");
  });

  test("a landed input found on the THROWN channel is spared too", async () => {
    const landed = makeInput("landed");
    const h = makeHarness();
    const adapter = makeAdapter([landed], new Map([
      ["landed", { hash: "0xearlier", blockNumber: 3n }],
    ]), { throwInstead: new Error("Transaction submission error") });

    await h.processor.processBatchForTarget(adapter, TARGET, [landed])
      .catch(() => {});

    expect(h.charged).toEqual([]);
    expect(h.statesOf(landed)).toEqual(["batching", "confirmed"]);
    expect(h.removed).toEqual([landed]);
  });
});

describe("FR-3 — the check can never make things worse", () => {
  test("an adapter without the hook behaves EXACTLY as it did before", async () => {
    const lost = makeInput("lost");
    const h = makeHarness();
    const adapter = makeAdapter([lost], new Map(), { withoutHook: true });

    await h.processor.processBatchForTarget(adapter, TARGET, [lost]);

    expect(h.charged).toEqual([lost]);
    expect(h.removed).toEqual([]);
    expect(h.journal).not.toContain("getStatus");
  });

  test("a hook that throws charges exactly as before", async () => {
    const lost = makeInput("lost");
    const h = makeHarness();
    const adapter = makeAdapter([lost], new Map(), {
      findError: new Error("indexer unreachable"),
    });

    await h.processor.processBatchForTarget(adapter, TARGET, [lost]);

    expect(h.charged).toEqual([lost]);
  });

  test("a status lookup that throws still lets the check run", async () => {
    const landed = makeInput("landed");
    const seenContexts: Array<{ address: string; transactionHash?: string }> = [];
    const h = makeHarness({ statusError: new Error("status store down") });
    const adapter = makeAdapter([landed], new Map([
      ["landed", { hash: "0xfound-by-identifier" }],
    ]), { seenContexts });

    await h.processor.processBatchForTarget(adapter, TARGET, [landed]);

    // No recorded hash is not the same as no evidence: the adapter may still
    // watch the input's own identifiers, which is the case where the batcher
    // died BEFORE it could write the hash down.
    expect(seenContexts).toEqual([{ address: "landed", transactionHash: undefined }]);
    expect(h.charged).toEqual([]);
    expect(h.detailOf(landed, "confirmed")?.transactionHash).toBe(
      "0xfound-by-identifier",
    );
  });

  test("a queue-only backend with no getStatus still reconciles", async () => {
    const landed = makeInput("landed");
    const h = makeHarness({ withoutGetStatus: true });
    const adapter = makeAdapter([landed], new Map([
      ["landed", { hash: "0xfound" }],
    ]));

    await h.processor.processBatchForTarget(adapter, TARGET, [landed]);

    expect(h.charged).toEqual([]);
    expect(h.removed).toEqual([landed]);
  });

  test("a removal that fails still leaves the request confirmed, never exhausted", async () => {
    const landed = makeInput("landed");
    const h = makeHarness({ removeError: new Error("storage down") });
    const adapter = makeAdapter([landed], new Map([
      ["landed", { hash: "0xearlier", blockNumber: 5n }],
    ]));

    await h.processor.processBatchForTarget(adapter, TARGET, [landed]);

    expect(h.statesOf(landed)).toEqual(["batching", "confirmed"]);
    // The row survives and will be re-picked — and will be reconciled again,
    // which is self-healing. What must never happen is that it gets charged.
    expect(h.charged).toEqual([]);
  });

  test("nothing is asked when there is nothing to charge", async () => {
    const fine = makeInput("fine");
    const seenContexts: Array<{ address: string; transactionHash?: string }> = [];
    const h = makeHarness();
    const adapter = makeAdapter([fine], new Map(), { seenContexts });
    adapter.submitBatch = async () => ({ hash: "0xok", submitted: [fine] });
    adapter.waitForTransactionReceipt = async () => ({
      hash: "0xok",
      blockNumber: 1n,
      status: 1,
    });

    await h.processor.processBatchForTarget(adapter, TARGET, [fine]);

    expect(seenContexts).toEqual([]);
    expect(h.statesOf(fine)).toEqual(["batching", "submitted", "confirmed"]);
  });
});

describe("FR-3 — the per-input hash the reconciliation depends on", () => {
  test("a multi-transaction batch records each input's OWN hash at submit time", async () => {
    // A comma-joined batch hash is not evidence about an individual input: if
    // `submitted` recorded it, a later landed-check keyed on that field would
    // confirm every input in the batch the moment ANY of them was found.
    const a = makeInput("a");
    const b = makeInput("b");
    const h = makeHarness();
    const adapter = makeAdapter([a, b], new Map());
    adapter.submitBatch = async () => ({
      hash: "0xhash-a,0xhash-b",
      submitted: [a, b],
    });
    adapter.waitForTransactionReceipt = async () => ({
      hash: "0xhash-a,0xhash-b",
      blockNumber: 2n,
      status: 1,
    });

    await h.processor.processBatchForTarget(adapter, TARGET, [a, b]);

    expect(h.detailOf(a, "submitted")?.transactionHash).toBe("0xhash-a");
    expect(h.detailOf(b, "submitted")?.transactionHash).toBe("0xhash-b");
  });

  test("a shared batch hash is still shared by everyone in it", async () => {
    const a = makeInput("a");
    const b = makeInput("b");
    const h = makeHarness();
    const adapter = makeAdapter([a, b], new Map());
    adapter.submitBatch = async () => ({ hash: "0xshared", submitted: [a, b] });
    adapter.waitForTransactionReceipt = async () => ({
      hash: "0xshared",
      blockNumber: 2n,
      status: 1,
    });

    await h.processor.processBatchForTarget(adapter, TARGET, [a, b]);

    expect(h.detailOf(a, "submitted")?.transactionHash).toBe("0xshared");
    expect(h.detailOf(b, "submitted")?.transactionHash).toBe("0xshared");
  });
});
