// Child entrypoint for the validation pool. One job per message.
//
// Runs in its own process so a wedged WASM call can be SIGKILLed and its core
// reclaimed — measured to be impossible with worker_threads on Bun, where
// terminate() never settles and the thread keeps burning. See
// validation-executor.ts.
//
// The ledger WASM is imported once at startup, not per job: a pre-warmed pool
// is the whole reason this process is long-lived.

import {
  LedgerParameters,
  LedgerState,
  Transaction as LedgerTransaction,
  WellFormedStrictness,
} from "@midnight-ntwrk/ledger-v8";
import {
  type StrictnessFlags,
  type TxStage,
  validateWellFormed,
  type ValidationPhase,
  boundedReason,
} from "./midnight-tx-validation.ts";

interface IncomingJob {
  txBytes: Uint8Array;
  paramsBytes: Uint8Array;
  networkId: string;
  phase: ValidationPhase;
  txStage: TxStage;
  nowMs: number;
  includeDiagnostics?: boolean;
}

/**
 * Marker triple per stage. These are not interchangeable: they tell the
 * deserializer which proof and binding representations to expect, and the
 * wrong triple throws rather than silently mis-parsing.
 *
 * `txStage` reaches us from the sender's successful typed deserializer, never
 * from caller-supplied metadata — it selects whether signatures get verified.
 */
const MARKERS: Record<TxStage, [string, string, string]> = {
  unproven: ["signature", "pre-proof", "pre-binding"],
  unbound: ["signature", "proof", "pre-binding"],
  finalized: ["signature", "proof", "binding"],
};

let appliedStrictness: StrictnessFlags | undefined;

const ledgerBinding = {
  blankState(networkId: string, params: unknown) {
    const state = LedgerState.blank(networkId);
    // A blank state carries default parameters; the live ones matter because
    // limits and pricing are checked against them.
    state.parameters = params as LedgerParameters;
    return state;
  },
  makeStrictness(flags: StrictnessFlags) {
    appliedStrictness = { ...flags };
    // Every field is assigned: the constructor defaults ALL of them to true,
    // so anything left alone silently enables a check we measured to be either
    // inert or actively harmful.
    const strictness = new WellFormedStrictness();
    strictness.enforceBalancing = flags.enforceBalancing;
    strictness.verifySignatures = flags.verifySignatures;
    strictness.enforceLimits = flags.enforceLimits;
    strictness.verifyNativeProofs = flags.verifyNativeProofs;
    strictness.verifyContractProofs = flags.verifyContractProofs;
    return strictness;
  },
  wellFormed(tx: unknown, state: unknown, strictness: unknown, now: Date) {
    (tx as { wellFormed: (s: unknown, st: unknown, t: Date) => unknown })
      .wellFormed(state, strictness, now);
  },
};

process.on("message", (raw: unknown) => {
  const job = raw as IncomingJob;
  try {
    appliedStrictness = undefined;
    const params = LedgerParameters.deserialize(job.paramsBytes);
    const [markerS, markerP, markerB] = MARKERS[job.txStage];
    const tx = (LedgerTransaction.deserialize as (
      s: string,
      p: string,
      b: string,
      raw: Uint8Array,
    ) => unknown)(markerS, markerP, markerB, job.txBytes);

    const verdict = validateWellFormed(
      tx,
      {
        phase: job.phase,
        txStage: job.txStage,
        networkId: job.networkId,
        params,
        nowMs: job.nowMs,
      },
      ledgerBinding,
    );
    process.send?.(
      job.includeDiagnostics && appliedStrictness
        ? {
          ...verdict,
          diagnostics: {
            phase: job.phase,
            txStage: job.txStage,
            strictness: appliedStrictness,
          },
        }
        : verdict,
    );
  } catch (error) {
    // Fails closed, including a failure to deserialize: bytes we cannot even
    // parse are not bytes we should sponsor.
    process.send?.({
      valid: false,
      errorCode: "NOT_WELL_FORMED",
      reason: boundedReason(error),
    });
  }
});
