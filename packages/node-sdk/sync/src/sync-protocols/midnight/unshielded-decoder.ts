import * as ledger from "@midnight-ntwrk/ledger-v8";
import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";

/**
 * Decodes the unshielded UTXOs a Midnight transaction creates, from the transaction's own archived
 * bytes — the reader-side equivalent of the indexer's `unshieldedCreatedOutputs`.
 *
 * **Every rule here was verified against a live indexer, not inferred from type signatures.** Each
 * one had a plausible-looking wrong answer that would have produced a silently wrong feed:
 *
 * - `intentHash` is **section-sensitive**. Guaranteed outputs hash with `intentHash(0)`; fallible
 *   outputs hash with `intentHash(<the intent's own segment id>)`. Measured: a fallible output under
 *   segment 1 matched `intentHash(1)` and not `intentHash(0)`, across 3 rows in 2 transactions.
 *   An earlier version of this logic used `intentHash(0)` everywhere, generalising from a single
 *   guaranteed row; the corpus at the time contained no fallible row to refute it.
 * - `outputIndex` **restarts at 0 for each section**, matching the reference's per-call
 *   `.enumerate()`. It is not one counter shared across guaranteed and fallible.
 * - `owner` is **Bech32m**, not the raw payload the ledger returns. Verified byte-for-byte against
 *   an indexer-reported address.
 * - Fallible outputs count **only for segments that succeeded**. The reference filters on exactly
 *   this, and a failed transaction contributes nothing at all.
 *
 * Reference: `midnight-indexer/indexer-common/src/domain/ledger/ledger_state.rs`,
 * `unshielded_utxos_v8` / `extend_unshielded_utxos_v8`.
 */

/** One created unshielded UTXO, in the exact shape `MidnightUnshieldedCreatePrimitive` consumes. */
export interface DecodedUnshieldedCreate {
  /** Bech32m owner address (e.g. `mn_addr_undeployed1…`). */
  owner: string;
  /** Hex intent hash — section-sensitive, see the module doc. */
  intentHash: string;
  /** Index within this section's output list, restarting per section. */
  outputIndex: number;
  /** u128 as a decimal string — the value can exceed `Number.MAX_SAFE_INTEGER`. */
  value: string;
  /** Hex token type. */
  tokenType: string;
}

/**
 * Why a transaction could not be decoded into a complete, trustworthy output set.
 *
 * These are **refusals, not empty results.** Returning `[]` for any of them would be
 * indistinguishable from "this transaction genuinely created nothing", which is precisely how a
 * broken feed looks identical to a quiet chain.
 */
export type UnshieldedRefusal =
  /** `ClaimRewards` creates a UTXO with **no intent at all** — the ledger derives a synthetic
   *  intent hash internally, which this reader does not reproduce. An intent walk silently yields
   *  nothing, so the transaction must be refused instead. Measured: 20 of 26 regular transactions
   *  on a fresh dev chain are of this shape. */
  | { reason: "claim_rewards"; txHash: string }
  /** The transaction's applied result is unknown or not a full success. Stock UmbraDB never
   *  populates `transactions.result`, so fallible outputs cannot be filtered by successful segment
   *  and would be over-reported. */
  | { reason: "result_unknown_or_not_success"; txHash: string; result: string | undefined }
  /** The ledger rejected the archived bytes. */
  | { reason: "undecodable"; txHash: string; message: string };

export type UnshieldedDecodeOutcome =
  | { ok: true; outputs: DecodedUnshieldedCreate[] }
  | { ok: false; refusal: UnshieldedRefusal };

function toBech32m(networkId: string, rawOwner: string): string {
  const hex = rawOwner.startsWith("0x") ? rawOwner.slice(2) : rawOwner;
  return MidnightBech32m
    .encode(networkId as never, new UnshieldedAddress(Buffer.from(hex, "hex")))
    .asString();
}

/**
 * @param rawBytes the transaction's archived `tx_raw` bytes
 * @param result the transaction's applied result, or `undefined` when the archive does not record
 *   one. `undefined` is treated as a refusal, never as success — see `UnshieldedRefusal`.
 * @param networkId the network the addresses belong to (`undeployed`, `testnet`, …)
 */
export function decodeUnshieldedCreates(
  rawBytes: Uint8Array,
  result: string | undefined,
  networkId: string,
  txHash: string,
): UnshieldedDecodeOutcome {
  let tx: any;
  try {
    tx = ledger.Transaction.deserialize("signature", "proof", "binding", rawBytes);
  } catch (e) {
    return { ok: false, refusal: { reason: "undecodable", txHash, message: (e as Error)?.message ?? String(e) } };
  }

  // ClaimRewards first: it is a *regular* transaction, so nothing else distinguishes it, and its
  // intent walk is empty rather than erroring.
  if (tx.rewards !== undefined && tx.rewards !== null) {
    return { ok: false, refusal: { reason: "claim_rewards", txHash } };
  }

  // Only a full success lets every offer be taken at face value. PARTIAL_SUCCESS would require
  // per-segment filtering, and the segment map is not available from the archive.
  if (result !== "success") {
    return { ok: false, refusal: { reason: "result_unknown_or_not_success", txHash, result } };
  }

  const outputs: DecodedUnshieldedCreate[] = [];

  // GUARANTEED phase: every intent contributes, hashed with segment 0 regardless of its own key.
  for (const [, intent] of tx.intents ?? new Map()) {
    const offer = intent.guaranteedUnshieldedOffer;
    if (offer === undefined || offer === null) continue;
    const intentHash = String(intent.intentHash(0));
    let outputIndex = 0; // restarts for this section
    for (const out of offer.outputs) {
      outputs.push({
        owner: toBech32m(networkId, String(out.owner)),
        intentHash,
        outputIndex: outputIndex++,
        value: String(out.value),
        tokenType: String(out.type),
      });
    }
  }

  // FALLIBLE phase: an intent's fallible offer is hashed with THAT intent's segment id.
  for (const [segmentRaw, intent] of tx.intents ?? new Map()) {
    const offer = intent.fallibleUnshieldedOffer;
    if (offer === undefined || offer === null) continue;
    const segment = Number(segmentRaw);
    const intentHash = String(intent.intentHash(segment));
    let outputIndex = 0; // restarts for this section
    for (const out of offer.outputs) {
      outputs.push({
        owner: toBech32m(networkId, String(out.owner)),
        intentHash,
        outputIndex: outputIndex++,
        value: String(out.value),
        tokenType: String(out.type),
      });
    }
  }

  return { ok: true, outputs };
}
