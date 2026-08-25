import { createHash } from "node:crypto";
import type { DefaultBatcherInput } from "./types.ts";

/**
 * The replay key — "have we already PAID for this spend?".
 *
 * Deliberately a different question from the `requestId`, which asks "is this
 * the same request?". Collapsing the two would leave the batcher payable twice,
 * and the gap is not theoretical:
 *
 *   the request id hashes the full content key, and that key includes `target`
 *   — a field most wallets do not sign. Take a signed submission, rewrite its
 *   target, resubmit: a NEW request id, the SAME signature, and a second
 *   transaction paid for out of the batcher's own dust.
 *
 * So the default key is derived from the signature alone and is deliberately
 * NOT scoped by target. Keying on something an attacker can rewrite would
 * defeat the purpose; the signature is the one field they cannot re-mint.
 *
 * Chains without per-input signatures (Midnight, where the input IS a
 * transaction) have nothing here to key on and supply their own extraction via
 * {@link BlockchainAdapter.getReplayKey} — which must derive the key from what
 * the CHAIN would consider the same spend, for exactly the same reason.
 */

/**
 * sha256 of the signature, hex — or `undefined` when there is no signature.
 *
 * Not a secret and not meant to be: the signature is public on chain (spec Q1),
 * so any client can recompute this key and reason about its own resubmissions.
 * `undefined` means "no dedup for this input", which is an admission, not a
 * refusal — see `resolveReplayKey`.
 */
export function defaultReplayKey(
  input: DefaultBatcherInput,
): string | undefined {
  const signature = input.signature;
  // An empty signature carries exactly as much replay protection as none.
  if (typeof signature !== "string" || signature.length === 0) return undefined;
  return createHash("sha256").update(signature, "utf8").digest("hex");
}

/** The one method of an adapter this module needs; keeps core free of the adapter type. */
interface ReplayKeyProvider {
  getReplayKey?(input: DefaultBatcherInput): string | undefined;
}

/**
 * The replay key for an input, as its adapter sees it.
 *
 * An adapter that IMPLEMENTS the hook is authoritative — including when it
 * answers `undefined`. Falling back to the signature there would re-enable
 * dedup on an input the adapter deliberately declined to dedup, and the adapter
 * is the only party that knows what its payloads mean.
 *
 * A hook that THROWS yields `undefined` (admit, no dedup). Fail-open on
 * purpose: dedup is an optimisation on top of protection the chain already
 * enforces, so a broken hook must not turn every submission into a 500.
 */
export function resolveReplayKey(
  adapter: ReplayKeyProvider | undefined,
  input: DefaultBatcherInput,
): string | undefined {
  if (adapter && typeof adapter.getReplayKey === "function") {
    try {
      return adapter.getReplayKey(input);
    } catch (error) {
      console.warn(
        `[Batcher] Adapter getReplayKey() threw; admitting the input without ` +
          `replay protection: ${
            error instanceof Error ? error.message : error
          }`,
      );
      return undefined;
    }
  }
  return defaultReplayKey(input);
}
