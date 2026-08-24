// Shape limits bound the WORK a caller can ask for. Byte size does not:
// a 46-output transfer and a 1-output transfer both fit under the 500,000-char
// input cap, but cost ~2.21 s and ~128 ms of proof verification respectively.

import { describe, expect, test } from "bun:test";
import {
  admissionWeight,
  UNMEASURABLE_ADMISSION_WEIGHT,
  checkShapeLimits,
  DEFAULT_SHAPE_LIMITS,
  type ShapeLimits,
} from "../adapters/shape-limits.ts";
import type { PolicyInspectableTx } from "../adapters/midnight-policy.ts";

const tx = (inputs: number, outputs: number, transients = 0): PolicyInspectableTx => ({
  guaranteedOffer: {
    deltas: new Map(),
    inputs: Array.from({ length: inputs }, () => ({})),
    outputs: Array.from({ length: outputs }, () => ({})),
    transients: Array.from({ length: transients }, () => ({})),
  },
});

describe("shape limits", () => {
  test("no limits configured ⇒ everything passes (back-compat)", () => {
    expect(checkShapeLimits(tx(50, 50), undefined).valid).toBe(true);
    expect(checkShapeLimits(tx(50, 50), {}).valid).toBe(true);
  });

  test("a transaction within every ceiling passes, and reports its shape", () => {
    const v = checkShapeLimits(tx(2, 3, 1), {
      maxInputs: 4,
      maxOutputs: 4,
      maxTransients: 2,
      maxProofElements: 10,
    });
    expect(v.valid).toBe(true);
    expect(v.shape).toEqual({ inputs: 2, outputs: 3, transients: 1, total: 6 });
  });

  test("REGRESSION: the measured worst case is refused", () => {
    // 46 outputs is the shape that took 2.21 s p50 — policy-conforming for a
    // transfers product, since allowZswapTransfers does not constrain fan-out.
    const v = checkShapeLimits(tx(1, 46), { maxOutputs: 8 });
    expect(v.valid).toBe(false);
    expect(v.errorCode).toBe("SHAPE_LIMIT_EXCEEDED");
    expect(v.reason).toContain("outputs");
    expect(v.reason).toContain("46");
  });

  test("each ceiling is enforced independently", () => {
    const limits: ShapeLimits = { maxInputs: 2, maxOutputs: 2, maxTransients: 1 };
    expect(checkShapeLimits(tx(3, 1, 0), limits).reason).toContain("inputs");
    expect(checkShapeLimits(tx(1, 3, 0), limits).reason).toContain("outputs");
    expect(checkShapeLimits(tx(1, 1, 2), limits).reason).toContain("transients");
  });

  test("the aggregate ceiling catches what per-field ceilings miss", () => {
    // Under every individual limit, yet 24 proof elements in total.
    const limits: ShapeLimits = {
      maxInputs: 8,
      maxOutputs: 8,
      maxTransients: 8,
      maxProofElements: 12,
    };
    const v = checkShapeLimits(tx(8, 8, 8), limits);
    expect(v.valid).toBe(false);
    expect(v.reason).toContain("proof elements");
  });

  test("fails CLOSED when the shape cannot be read", () => {
    const hostile = {
      get guaranteedOffer(): never {
        throw new Error("WASM exploded");
      },
    } as unknown as PolicyInspectableTx;
    const v = checkShapeLimits(hostile, { maxOutputs: 1 });
    expect(v.valid).toBe(false);
    expect(v.errorCode).toBe("SHAPE_INTROSPECTION_FAILED");
  });
});

describe("admission weight", () => {
  test("weight is the proof-bearing element count, not the request count", () => {
    // The point of weighting: these two cost ~17x differently to verify, and
    // must not draw down a budget equally.
    expect(admissionWeight(tx(1, 1))).toBe(2);
    expect(admissionWeight(tx(1, 46))).toBe(47);
  });

  test("weight is never zero — an empty transaction still costs something", () => {
    expect(admissionWeight({})).toBe(1);
    expect(admissionWeight(tx(0, 0))).toBe(1);
  });

  test("an unreadable shape is charged as heavy, not merely non-zero", () => {
    const hostile = {
      get guaranteedOffer(): never {
        throw new Error("nope");
      },
    } as unknown as PolicyInspectableTx;

    // The previous assertion here was `toBeGreaterThanOrEqual(1)`, which is
    // satisfied by the cheapest weight there is. It passed while the function
    // returned 1 for an unmeasurable transaction — the exact opposite of what
    // its comment promised — so it is asserted concretely now.
    expect(admissionWeight(hostile)).toBe(UNMEASURABLE_ADMISSION_WEIGHT);

    // And "heavy" has to mean something: it must not fit in a realistic
    // bucket, or an attacker buys a cheap rate with bytes we cannot measure.
    expect(admissionWeight(hostile)).toBeGreaterThan(
      admissionWeight(tx(100, 100)),
    );
  });
});

describe("the default ceiling", () => {
  test("is ON, so a product that configures nothing is still bounded", () => {
    // The whole point of a default: protection that does not depend on the
    // operator having already known to ask for it.
    expect(DEFAULT_SHAPE_LIMITS.maxProofElements).toBe(64);
    expect(checkShapeLimits(tx(1, 200), DEFAULT_SHAPE_LIMITS).valid).toBe(false);
  });

  test("clears the measured worst case with headroom", () => {
    // 47 elements = the 2.21 s p50 shape. It must still be accepted, or the
    // default breaks legitimate high-fan-out transfers on day one.
    expect(checkShapeLimits(tx(1, 46), DEFAULT_SHAPE_LIMITS).valid).toBe(true);
  });

  test("sits exactly at 64 elements", () => {
    expect(checkShapeLimits(tx(32, 32), DEFAULT_SHAPE_LIMITS).valid).toBe(true);
    expect(checkShapeLimits(tx(32, 33), DEFAULT_SHAPE_LIMITS).valid).toBe(false);
  });

  test("only the aggregate is set — per-field ceilings stay open", () => {
    // What bounds the work is the total; the per-field limits exist for
    // products that want to constrain a specific dimension deliberately.
    expect(DEFAULT_SHAPE_LIMITS.maxInputs).toBeUndefined();
    expect(DEFAULT_SHAPE_LIMITS.maxOutputs).toBeUndefined();
    expect(DEFAULT_SHAPE_LIMITS.maxTransients).toBeUndefined();
  });
});
