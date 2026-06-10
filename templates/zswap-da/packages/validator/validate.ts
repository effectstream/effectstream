import { Transaction } from "@midnight-ntwrk/ledger-v8";
import type { UnprovenTransaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer, OFFER_HRP } from "mip-zswap-offer";

import {
  collectNullifiers,
  collectUnshieldedSpends,
  deriveLegs,
  UnknownTokenTagError,
} from "./derive.ts";
import { buildStrictness } from "./refstate.ts";
import type {
  OfferRejectCode,
  OfferValidation,
  ValidateOpts,
} from "./types.ts";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// `identifiers()` is only needed for dedup; never let it sink a validation.
function safeIdentifiers(tx: UnprovenTransaction): string[] {
  try {
    return tx.identifiers();
  } catch {
    return [];
  }
}

/**
 * Validate a ZSwap offer blob. Deterministic given (blob, refState, tblock) —
 * safe to call inside the state machine. Steps run cheap → expensive and stop
 * at the first failure:
 *
 *   1 encoding · 2 size · 3 deserialize · 4 structural/semantic · 5 crypto
 *   (wellFormed) · 6 liveness (optional sync) · 7 dedup (optional)
 *
 * On success — and whenever deserialization succeeds — the derived
 * `tx/nullifiers/unshieldedSpends/gives/wants/identifiers` are returned so a
 * caller can run its own async liveness without reparsing.
 */
export function validateZswapOffer(
  blob: string,
  opts: ValidateOpts,
): OfferValidation {
  // ── 1. Encoding ──
  if (typeof blob !== "string" || !blob.startsWith(`${OFFER_HRP}1`)) {
    return {
      ok: false,
      code: "BAD_ENCODING",
      reason: "not a zswapoffer bech32m string",
    };
  }
  let rawTx: Uint8Array;
  try {
    rawTx = decodeOffer(blob);
  } catch (e) {
    return {
      ok: false,
      code: "BAD_ENCODING",
      reason: `bech32m decode failed: ${errMsg(e)}`,
    };
  }

  // ── 2. Size ──
  if (rawTx.length > opts.maxBytes) {
    return {
      ok: false,
      code: "TOO_LARGE",
      reason: `offer is ${rawTx.length} bytes > max ${opts.maxBytes}`,
    };
  }

  // ── 3. Deserialize (Lace-shaped <signature, proof, binding>) ──
  let tx: UnprovenTransaction;
  try {
    tx = Transaction.deserialize(
      "signature" as const,
      "proof" as const,
      "binding" as const,
      rawTx,
    ) as UnprovenTransaction;
  } catch (e) {
    return {
      ok: false,
      code: "BAD_DESERIALIZE",
      reason: `deserialize failed: ${errMsg(e)}`,
    };
  }

  // ── 4. Structural / semantic ──
  const nullifiers = collectNullifiers(tx);
  const unshieldedSpends = collectUnshieldedSpends(tx);
  if (nullifiers.length === 0 && unshieldedSpends.length === 0) {
    return {
      ok: false,
      code: "NO_SPENDABLE_INPUT",
      reason: "no shielded input/transient or unshielded spend",
      tx,
    };
  }

  let gives, wants;
  try {
    ({ gives, wants } = deriveLegs(tx));
  } catch (e) {
    if (e instanceof UnknownTokenTagError) {
      return {
        ok: false,
        code: "UNKNOWN_TOKEN",
        reason: e.message,
        tx,
        nullifiers,
        unshieldedSpends,
      };
    }
    // Segment ids came from the tx itself; a throw here means a malformed tx.
    return {
      ok: false,
      code: "BAD_DESERIALIZE",
      reason: `imbalance derivation failed: ${errMsg(e)}`,
      tx,
      nullifiers,
      unshieldedSpends,
    };
  }
  if (gives.length === 0 || wants.length === 0) {
    return {
      ok: false,
      code: "NOT_A_SWAP",
      reason:
        `expected ≥1 give and ≥1 want; got ${gives.length} give(s), ${wants.length} want(s)`,
      tx,
      nullifiers,
      unshieldedSpends,
      gives,
      wants,
    };
  }

  const identifiers = safeIdentifiers(tx);
  const derived = { tx, nullifiers, unshieldedSpends, gives, wants, identifiers };

  // ── 5. Cryptographic (rejects forged proofs / made-up coins) ──
  try {
    tx.wellFormed(opts.refState, buildStrictness(), opts.tblock);
  } catch (e) {
    const m = errMsg(e);
    const code: OfferRejectCode = /signature/i.test(m)
      ? "SIGNATURE_INVALID"
      : "PROOF_INVALID";
    return { ok: false, code, reason: `wellFormed failed: ${m}`, ...derived };
  }

  // ── 6. Liveness (optional synchronous checks) ──
  if (opts.isNullifierSpent) {
    for (const n of nullifiers) {
      if (opts.isNullifierSpent(n)) {
        return {
          ok: false,
          code: "NULLIFIER_SPENT",
          reason: `nullifier already spent: ${n}`,
          ...derived,
        };
      }
    }
  }
  if (opts.isUnshieldedSpent) {
    for (const ref of unshieldedSpends) {
      if (opts.isUnshieldedSpent(ref)) {
        return {
          ok: false,
          code: "UTXO_SPENT",
          reason:
            `unshielded UTXO already spent: ${ref.owner}/${ref.intentHash}/${ref.outputNo}`,
          ...derived,
        };
      }
    }
  }

  // ── 7. Dedup (optional) ──
  if (opts.seen && opts.seen(nullifiers, identifiers)) {
    return { ok: false, code: "DUPLICATE", reason: "offer already seen", ...derived };
  }

  return { ok: true, ...derived };
}
