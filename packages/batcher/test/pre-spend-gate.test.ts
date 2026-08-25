import { describe, expect, test } from "bun:test";
import type { DefaultBatcherInput } from "../core/types.ts";
import type { PolicyInspectableTx } from "../adapters/midnight-policy.ts";
import {
  buildPreSpendValidationJob,
  buildPreSubmitValidationJob,
  buildWorkerBatchOutcome,
  classifyWorkerFailure,
  enforcePreSpendTtl,
  hardGateVerdictFor,
  hardPausedBatchOutcome,
  hardPauseHealthInfo,
  MidnightBalancingAdapter,
  PreSpendDefer,
  PreSpendPermanent,
  preSpendTtlFloorMs,
  PreSubmitInvariant,
  runPreSpendGate,
  runPreSubmitGate,
  safeRevertFinalized,
  waitForDustThenEnforceTtl,
} from "../adapters/midnight-balancing-adapter.ts";

const input: DefaultBatcherInput = {
  addressType: 1 as DefaultBatcherInput["addressType"],
  input: "0102",
  address: "caller",
  timestamp: "2026-08-14T00:00:00.000Z",
  target: "product-a",
};

describe("pre-spend failure taxonomy", () => {
  test("deterministic verdicts are permanent rejections", () => {
    const classified = classifyWorkerFailure(
      input,
      new PreSpendPermanent("bad network", "NOT_WELL_FORMED", 400),
    );

    expect(classified).toEqual({
      category: "permanentRejected",
      value: {
        input,
        error: "bad network",
        errorCode: "NOT_WELL_FORMED",
        statusCode: 400,
      },
    });
  });

  test("an unavailable dependency is an uncharged deferral", () => {
    const classified = classifyWorkerFailure(
      input,
      new PreSpendDefer("validation queue saturated"),
    );

    expect(classified).toEqual({
      category: "retryable",
      value: { input, reason: "validation queue saturated" },
    });
  });

  test("legacy balance, sign and submit errors consume a bounded retry", () => {
    const classified = classifyWorkerFailure(
      input,
      new Error("balance failed"),
    );

    expect(classified).toEqual({
      category: "failed",
      value: { input, error: "balance failed" },
    });
  });

  test("a finalized-output invariant identifies only its affected input", () => {
    const classified = classifyWorkerFailure(
      input,
      new PreSubmitInvariant(
        "our finalized output is invalid",
        "FINALIZED_OUTPUT_INVARIANT",
      ),
    );

    expect(classified).toEqual({
      category: "invariantFailure",
      value: {
        inputs: [input],
        message: "our finalized output is invalid",
        errorCode: "FINALIZED_OUTPUT_INVARIANT",
        hardPause: false,
      },
    });
  });

  test("the worker outcome keeps all four per-input fates distinct", () => {
    const good = { ...input, address: "good" };
    const doomed = { ...input, address: "doomed" };
    const deferred = { ...input, address: "deferred" };
    const failed = { ...input, address: "failed" };

    const outcome = buildWorkerBatchOutcome(
      [],
      [good, doomed, deferred, failed],
      [
        { status: "fulfilled", value: "0xgood" },
        {
          status: "rejected",
          reason: new PreSpendPermanent("bad network", "NOT_WELL_FORMED"),
        },
        {
          status: "rejected",
          reason: new PreSpendDefer("worker saturated"),
        },
        { status: "rejected", reason: new Error("balance failed") },
      ],
    );

    expect(outcome.hash).toBe("0xgood");
    expect(outcome.submitted).toEqual([good]);
    expect(outcome.permanentRejected?.map((item) => item.input)).toEqual([
      doomed,
    ]);
    expect(outcome.retryable?.map((item) => item.input)).toEqual([deferred]);
    expect(outcome.failed?.map((item) => item.input)).toEqual([failed]);
  });

  test("an all-permanent worker batch returns a no-hash outcome", () => {
    const outcome = buildWorkerBatchOutcome(
      [],
      [input],
      [{
        status: "rejected",
        reason: new PreSpendPermanent("expired", "TTL_TOO_SHORT"),
      }],
    );

    expect(outcome.hash).toBeUndefined();
    expect(outcome.submitted).toEqual([]);
    expect(outcome.permanentRejected).toHaveLength(1);
  });

  test("independent workers can produce permanent and invariant outcomes together", () => {
    const doomed = { ...input, address: "doomed" };
    const affected = { ...input, address: "affected" };
    const outcome = buildWorkerBatchOutcome(
      [],
      [doomed, affected],
      [
        {
          status: "rejected",
          reason: new PreSpendPermanent("bad original", "NOT_WELL_FORMED"),
        },
        {
          status: "rejected",
          reason: new PreSubmitInvariant("our finalized output is invalid"),
        },
      ],
    );

    expect(outcome.permanentRejected?.map((item) => item.input)).toEqual([
      doomed,
    ]);
    expect(outcome.invariantFailure?.inputs).toEqual([affected]);
  });
});

async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected the pre-spend gate to throw");
  } catch (error) {
    return error;
  }
}

const readyParams = {
  ok: true as const,
  params: { serialize: () => new Uint8Array([9, 8, 7]) } as never,
  height: 42,
  ageMs: 1,
};

describe("pre-spend orchestration", () => {
  test("policy runs before expensive validation", async () => {
    const order: string[] = [];

    await runPreSpendGate({
      hardGateVerdict: () => undefined,
      policyVerdict: async () => {
        order.push("policy");
        return { valid: true, rule: "allowZswapTransfers" };
      },
      getParams: () => readyParams,
      validate: async () => {
        order.push("validate");
        return { valid: true };
      },
    });

    expect(order).toEqual(["policy", "validate"]);
  });

  test("an invalid executor verdict becomes permanent", async () => {
    const error = await thrownBy(runPreSpendGate({
      hardGateVerdict: () => undefined,
      getParams: () => readyParams,
      validate: async () => ({
        valid: false,
        errorCode: "NOT_WELL_FORMED",
        reason: "wrong network",
      }),
    }));

    expect(error).toBeInstanceOf(PreSpendPermanent);
    expect((error as PreSpendPermanent).errorCode).toBe("NOT_WELL_FORMED");
  });

  test("cache staleness and executor failure defer without a verdict", async () => {
    let validationCalls = 0;
    const stale = await thrownBy(runPreSpendGate({
      hardGateVerdict: () => undefined,
      getParams: () => ({ ok: false, reason: "stale", ageMs: 999_999 }),
      validate: async () => {
        validationCalls += 1;
        return { valid: true };
      },
    }));
    expect(stale).toBeInstanceOf(PreSpendDefer);
    expect(validationCalls).toBe(0);

    const crashed = await thrownBy(runPreSpendGate({
      hardGateVerdict: () => undefined,
      getParams: () => readyParams,
      validate: async () => {
        throw new Error("worker exited");
      },
    }));
    expect(crashed).toBeInstanceOf(PreSpendDefer);
    expect((crashed as PreSpendDefer).reason).toContain("worker exited");
  });

  test("tampered storage that exceeds shape limits is stopped before validation", async () => {
    const tampered = {
      guaranteedOffer: {
        deltas: new Map(),
        inputs: [{}],
        outputs: [{}, {}],
        transients: [],
      },
    } as unknown as PolicyInspectableTx;
    let validationCalls = 0;

    const error = await thrownBy(runPreSpendGate({
      hardGateVerdict: () => hardGateVerdictFor(tampered, { maxOutputs: 1 }),
      getParams: () => readyParams,
      validate: async () => {
        validationCalls += 1;
        return { valid: true };
      },
    }));

    expect(error).toBeInstanceOf(PreSpendPermanent);
    expect((error as PreSpendPermanent).errorCode).toBe("SHAPE_LIMIT_EXCEEDED");
    expect(validationCalls).toBe(0);
  });

  test("the executor job contains original stored bytes and typed stage", () => {
    const stored = {
      ...input,
      input: JSON.stringify({ tx: "0a0b", txStage: "finalized" }),
    };
    const job = buildPreSpendValidationJob(
      stored,
      "finalized",
      new Uint8Array([9, 8, 7]),
      "undeployed",
      1234,
    );

    expect([...job.txBytes]).toEqual([10, 11]);
    expect([...job.paramsBytes]).toEqual([9, 8, 7]);
    expect(job).toMatchObject({
      txStage: "finalized",
      networkId: "undeployed",
      phase: "pre-spend",
      nowMs: 1234,
    });
  });

  test("the finalized executor job selects the strict pre-submit boundary", () => {
    const job = buildPreSubmitValidationJob(
      new Uint8Array([1, 2, 3]),
      new Uint8Array([9, 8, 7]),
      "undeployed",
      5678,
    );

    expect([...job.txBytes]).toEqual([1, 2, 3]);
    expect(job).toMatchObject({
      txStage: "finalized",
      networkId: "undeployed",
      phase: "pre-submit",
      nowMs: 5678,
    });
  });
});

describe("spend-boundary TTL margin", () => {
  const NOW = 1_700_000_000_000;
  const withIntents = (...ttls: unknown[]): PolicyInspectableTx => ({
    intents: new Map(ttls.map((ttl, i) => [i, { ttl }])) as never,
  });

  test("too-short TTL is a permanent TTL_TOO_SHORT rejection", () => {
    let thrown: unknown;
    try {
      enforcePreSpendTtl(withIntents(NOW + 1_000), NOW, 120_000);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PreSpendPermanent);
    expect((thrown as PreSpendPermanent).errorCode).toBe("TTL_TOO_SHORT");
  });

  test("zero-intent transactions skip the TTL rule", () => {
    expect(() => enforcePreSpendTtl({}, NOW, 120_000)).not.toThrow();
  });

  test("the configured floor overrides submit plus proving allowance", () => {
    expect(preSpendTtlFloorMs({})).toBe(120_000);
    expect(preSpendTtlFloorMs({ minTtlRemainingMs: 345_678 })).toBe(345_678);
  });

  test("an intent that expires during the dust wait is rejected after the wait", async () => {
    const floor = 120_000;
    let nowMs = NOW;
    const tx = withIntents(NOW + floor + 1_000);
    const order: string[] = [];

    // It is safe before the wait, which is the setup needed to catch a stale
    // check accidentally moved ahead of dust availability.
    expect(() => enforcePreSpendTtl(tx, nowMs, floor)).not.toThrow();

    let thrown: unknown;
    try {
      await waitForDustThenEnforceTtl({
        waitForDust: async () => {
          order.push("wait");
          nowMs += 2_000;
        },
        prepareForSpend: async () => {
          order.push("prepare");
        },
        tx: () => {
          order.push("ttl");
          return tx;
        },
        now: () => nowMs,
        minRemainingMs: floor,
      });
    } catch (error) {
      thrown = error;
    }

    expect(order).toEqual(["wait", "prepare", "ttl"]);
    expect(thrown).toBeInstanceOf(PreSpendPermanent);
    expect((thrown as PreSpendPermanent).errorCode).toBe("TTL_TOO_SHORT");
  });
});

function makeFinalizedDustLane(revertSucceeds = true) {
  let pending = true;
  let revertCalls = 0;
  return {
    revert: async () => {
      revertCalls += 1;
      if (!revertSucceeds) return false;
      pending = false;
      return true;
    },
    useNext: () => {
      if (pending) throw new Error("finalized entry still owns the dust lane");
    },
    get pending() {
      return pending;
    },
    get revertCalls() {
      return revertCalls;
    },
  };
}

function safelyRevertLane(
  lane: ReturnType<typeof makeFinalizedDustLane>,
  onFailure: (reason: string) => void = () => {},
): Promise<boolean> {
  return safeRevertFinalized({
    revertTransaction: async () => {
      if (!await lane.revert()) {
        throw new Error("pending service is unavailable");
      }
    },
    context: "B01:1/W1:s0",
    onFailure,
  });
}

describe("pre-submit rollback orchestration", () => {
  test("a valid finalized output proceeds without rollback", async () => {
    const lane = makeFinalizedDustLane();
    let revalidationCalls = 0;

    await runPreSubmitGate({
      getParams: () => readyParams,
      validateFinalized: async () => ({ valid: true }),
      revertFinalized: () => safelyRevertLane(lane),
      revalidateOriginal: async () => {
        revalidationCalls += 1;
        return { valid: true };
      },
    });

    expect(lane.revertCalls).toBe(0);
    expect(lane.pending).toBe(true);
    expect(revalidationCalls).toBe(0);
  });

  test("stale parameters fail closed by reverting and deferring", async () => {
    const lane = makeFinalizedDustLane();
    let validationCalls = 0;
    const error = await thrownBy(runPreSubmitGate({
      getParams: () => ({ ok: false, reason: "stale", ageMs: 999_999 }),
      validateFinalized: async () => {
        validationCalls += 1;
        return { valid: true };
      },
      revertFinalized: () => safelyRevertLane(lane),
      revalidateOriginal: async () => ({ valid: true }),
    }));

    expect(error).toBeInstanceOf(PreSpendDefer);
    expect(validationCalls).toBe(0);
    expect(lane.revertCalls).toBe(1);
    expect(() => lane.useNext()).not.toThrow();
  });

  test("invalid finalized output plus invalid original is permanent and frees dust", async () => {
    const lane = makeFinalizedDustLane();
    const error = await thrownBy(runPreSubmitGate({
      getParams: () => readyParams,
      validateFinalized: async () => ({
        valid: false,
        errorCode: "NOT_WELL_FORMED",
        reason: "finalized output is invalid",
      }),
      revertFinalized: () => safelyRevertLane(lane),
      revalidateOriginal: async () => ({
        valid: false,
        errorCode: "NOT_WELL_FORMED",
        reason: "original input is invalid",
      }),
    }));

    expect(error).toBeInstanceOf(PreSpendPermanent);
    expect(lane.revertCalls).toBe(1);
    expect(() => lane.useNext()).not.toThrow();
  });

  test("executor throw defers after rollback and frees dust", async () => {
    const lane = makeFinalizedDustLane();
    let revalidationCalls = 0;
    const error = await thrownBy(runPreSubmitGate({
      getParams: () => readyParams,
      validateFinalized: async () => {
        throw new Error("validation worker timed out");
      },
      revertFinalized: () => safelyRevertLane(lane),
      revalidateOriginal: async () => {
        revalidationCalls += 1;
        return { valid: true };
      },
    }));

    expect(error).toBeInstanceOf(PreSpendDefer);
    expect(revalidationCalls).toBe(0);
    expect(lane.revertCalls).toBe(1);
    expect(() => lane.useNext()).not.toThrow();
  });

  test("failed finalized rollback hard-pauses without pretending the lane is free", async () => {
    const lane = makeFinalizedDustLane(false);
    let hardPausedReason: string | null = null;
    const error = await thrownBy(runPreSubmitGate({
      getParams: () => readyParams,
      validateFinalized: async () => ({
        valid: false,
        errorCode: "NOT_WELL_FORMED",
        reason: "finalized output is invalid",
      }),
      revertFinalized: () =>
        safelyRevertLane(lane, (reason) => {
          hardPausedReason ??= reason;
        }),
      revalidateOriginal: async () => ({ valid: true }),
    }));

    expect(error).toBeInstanceOf(PreSubmitInvariant);
    expect((error as PreSubmitInvariant).hardPause).toBe(true);
    expect(lane.pending).toBe(true);
    expect(() => lane.useNext()).toThrow(/still owns the dust lane/);
    expect(hardPauseHealthInfo(hardPausedReason)).toEqual({
      active: true,
      reason: expect.stringContaining("manual wallet recovery required"),
    });
    expect(
      hardPausedBatchOutcome(hardPausedReason!, [input]).invariantFailure,
    ).toMatchObject({
      inputs: [input],
      hardPause: true,
      errorCode: "ADAPTER_HARD_PAUSED",
    });
  });

  test("a hard-paused adapter refuses the next batch before any worker runs", async () => {
    const adapter = Object.create(
      MidnightBalancingAdapter.prototype,
    ) as MidnightBalancingAdapter;
    let workerCalls = 0;
    Object.assign(adapter as unknown as Record<string, unknown>, {
      initializationPromise: null,
      isInitialized: true,
      hardPausedReason: "manual wallet recovery required",
      log: { error: () => {} },
      _executeWorkerPipelines: async () => {
        workerCalls += 1;
        throw new Error("must not touch a wallet while hard-paused");
      },
    });

    const outcome = await adapter.submitBatch({
      selectedInputs: [input],
    } as never);

    expect(workerCalls).toBe(0);
    expect(outcome).toEqual(
      hardPausedBatchOutcome("manual wallet recovery required", [input]),
    );
  });

  test("invalid finalized output plus clean original is invariant and frees dust", async () => {
    const lane = makeFinalizedDustLane();
    const error = await thrownBy(runPreSubmitGate({
      getParams: () => readyParams,
      validateFinalized: async () => ({
        valid: false,
        errorCode: "NOT_WELL_FORMED",
        reason: "balancing introduced an invalid output",
      }),
      revertFinalized: () => safelyRevertLane(lane),
      revalidateOriginal: async () => ({ valid: true }),
    }));

    expect(error).toBeInstanceOf(PreSubmitInvariant);
    expect((error as PreSubmitInvariant).hardPause).toBe(false);
    expect(lane.revertCalls).toBe(1);
    expect(() => lane.useNext()).not.toThrow();
  });
});
