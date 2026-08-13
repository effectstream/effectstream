// Hard structural ceilings on a submitted transaction.
//
// Cost is driven by SHAPE, not byte count: zswap proof verification runs per
// input, output and transient, and those proofs are verified unconditionally —
// no `WellFormedStrictness` flag disables them. Measured on the published WASM,
// a 1-output transfer validates in ~128 ms while a 46-output one takes
// ~2.21 s, and both fit under the 500,000-character input cap. A size limit
// alone therefore does not bound the work a caller can ask for.
//
// These are HARD gates. They run before the custom policy filter, and the
// filter cannot widen them: an operator's filter may tighten what it sponsors,
// but must never be able to raise the ceiling that protects the process.

import { type PolicyInspectableTx, zswapOfferShape } from "./midnight-policy.ts";

export interface ShapeLimits {
  /** Max shielded inputs across all offers. */
  maxInputs?: number;
  /** Max shielded outputs across all offers. */
  maxOutputs?: number;
  /** Max transients across all offers. */
  maxTransients?: number;
  /**
   * Max total proof-bearing elements (inputs + outputs + transients). Catches
   * a transaction that stays under each individual ceiling while still being
   * expensive in aggregate.
   */
  maxProofElements?: number;
}

export interface ShapeVerdict {
  valid: boolean;
  /** Stable code for the rejection, suitable for a client to branch on. */
  errorCode?: "SHAPE_LIMIT_EXCEEDED" | "SHAPE_INTROSPECTION_FAILED";
  reason?: string;
  /** The measured shape, for logs and health. Present even when valid. */
  shape?: { inputs: number; outputs: number; transients: number; total: number };
}

/**
 * Weight charged for a transaction whose shape could not be read.
 *
 * Deliberately larger than any sane per-request ceiling, so an unmeasurable
 * transaction is refused rather than admitted cheaply. It is a rejection by
 * arithmetic: the limiter cannot fit it in any bucket.
 */
export const UNMEASURABLE_ADMISSION_WEIGHT = 1_000_000;

/**
 * The admission weight of a transaction: its proof-bearing element count,
 * floored at 1 so every request costs something.
 *
 * This is what a weighted rate limiter should charge, because it tracks the
 * verification work the transaction will cause rather than the fact that a
 * request arrived.
 */
export function admissionWeight(tx: PolicyInspectableTx): number {
  try {
    const s = zswapOfferShape(tx);
    return Math.max(1, s.inputs + s.outputs + s.transients);
  } catch {
    // Unreadable shape is charged as heavy, not free: an attacker must not be
    // able to buy a cheap rate by submitting something we cannot measure.
    //
    // `checkShapeLimits` also fails closed here, but only when a product has
    // configured limits at all — with none set it returns early and never
    // looks at the shape, so this path is the only thing standing between an
    // unreadable transaction and the cheapest possible rate.
    return UNMEASURABLE_ADMISSION_WEIGHT;
  }
}

/**
 * Check a transaction against a product's structural ceilings.
 *
 * Fails CLOSED: if the shape cannot be read, the transaction is refused. The
 * ledger getters are WASM-backed and can throw on unusual shapes, and "we
 * could not measure how expensive this is" is not a reason to accept it.
 */
export function checkShapeLimits(
  tx: PolicyInspectableTx,
  limits: ShapeLimits | undefined,
): ShapeVerdict {
  if (!limits || Object.keys(limits).length === 0) return { valid: true };

  let shape: { inputs: number; outputs: number; transients: number };
  try {
    shape = zswapOfferShape(tx);
  } catch (error) {
    return {
      valid: false,
      errorCode: "SHAPE_INTROSPECTION_FAILED",
      reason: `could not measure transaction shape: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const total = shape.inputs + shape.outputs + shape.transients;
  const measured = { ...shape, total };

  const exceeded = (
    [
      ["inputs", shape.inputs, limits.maxInputs],
      ["outputs", shape.outputs, limits.maxOutputs],
      ["transients", shape.transients, limits.maxTransients],
      ["proof elements", total, limits.maxProofElements],
    ] as const
  ).find(([, actual, max]) => max !== undefined && actual > max);

  if (exceeded) {
    const [what, actual, max] = exceeded;
    return {
      valid: false,
      errorCode: "SHAPE_LIMIT_EXCEEDED",
      reason: `too many ${what}: ${actual} exceeds the limit of ${max}`,
      shape: measured,
    };
  }

  return { valid: true, shape: measured };
}
