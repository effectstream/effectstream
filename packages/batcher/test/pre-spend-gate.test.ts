import { describe, expect, test } from "bun:test";
import type { DefaultBatcherInput } from "../core/types.ts";
import type { PolicyInspectableTx } from "../adapters/midnight-policy.ts";
import {
  buildPreSpendValidationJob,
  buildWorkerBatchOutcome,
  classifyWorkerFailure,
  enforcePreSpendTtl,
  hardGateVerdictFor,
  PreSpendDefer,
  PreSpendPermanent,
  preSpendTtlFloorMs,
  runPreSpendGate,
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
});
