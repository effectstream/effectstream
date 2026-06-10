import {
  CelestiaAdapter,
  type CelestiaAdapterConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";
import { getBlankRefState, validateZswapOffer } from "@zswap-da/validator";
import type { BatcherConfig } from "./config.ts";

// DoS guard on the decoded offer size; mirrors the node's OFFER_MAX_BYTES. The
// base adapter separately caps the on-wire blob at 1.5 MB.
const OFFER_MAX_BYTES = parseInt(
  process.env["OFFER_MAX_BYTES"] ?? String(1024 * 1024),
  10,
);

type ValidationResult = { valid: boolean; error?: string };

// CelestiaAdapter that validates a ZSwap offer before the batcher posts it (and
// pays a TIA fee). The batcher invokes `validateInput` in `batchInput()` BEFORE
// the blob is queued or submitted, so a rejected offer never costs a fee. This
// is the authoritative pre-fee gate — it also covers producers that hit the
// batcher's `/send-input` directly, bypassing `/api/zswap/submit`.
class ZswapCelestiaAdapter extends CelestiaAdapter {
  private readonly networkId: string;

  constructor(config: CelestiaAdapterConfig, networkId: string) {
    super(config);
    this.networkId = networkId;
  }

  override validateInput(input: DefaultBatcherInput): ValidationResult {
    // Base adapter checks: non-empty string input + max blob size.
    const base = super.validateInput(input);
    if (!base.valid) return base;

    // Structure + cryptographic proofs (steps 1–5): rejects malformed, forged,
    // and non-swap offers — the bulk of fee-wasting "bad" blobs. This is
    // self-contained (blank reference state + bundled verifier keys; no network
    // call), so the fee gate has no live dependency.
    //
    // Liveness (already-spent coins) is NOT repeated here: the batcher has no DB
    // access and the indexer has no point-lookup ("is X spent?") query — only
    // filtered subscriptions (unshieldedTransactions(address),
    // shieldedNullifierTransactions(nullifierPrefixes)). Liveness is enforced
    // deterministically at STM ingestion and at /api/zswap/submit (both consult
    // the node's permanent spent_* sets). Adding subscription-based best-effort
    // liveness here (indexer unshieldedTransactions / nullifier search) is a
    // clean follow-up.
    const result = validateZswapOffer(input.input, {
      refState: getBlankRefState(this.networkId),
      tblock: new Date(),
      maxBytes: OFFER_MAX_BYTES,
    });
    if (!result.ok) {
      return { valid: false, error: `${result.code}: ${result.reason ?? ""}` };
    }
    return { valid: true };
  }
}

export function createCelestiaAdapter(
  batcherConfig: BatcherConfig,
): CelestiaAdapter {
  return new ZswapCelestiaAdapter(
    {
      rpcUrl: batcherConfig.celestia.rpcUrl,
      namespace: batcherConfig.celestia.namespace,
      authToken: batcherConfig.celestia.authToken,
      network: batcherConfig.celestia.network,
      fee: batcherConfig.celestia.fee,
      gasLimit: batcherConfig.celestia.gasLimit,
      gasPrice: batcherConfig.celestia.gasPrice,
      gas: batcherConfig.celestia.gas,
      maxGasPrice: batcherConfig.celestia.maxGasPrice,
      txPriority: batcherConfig.celestia.txPriority,
      syncProtocolName: "parallelCelestia",
    },
    batcherConfig.midnight.id,
  );
}
