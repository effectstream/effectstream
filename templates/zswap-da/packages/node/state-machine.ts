import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import {
  addressFromKey,
  Transaction,
  type UnprovenTransaction,
  type TokenType,
} from "@midnight-ntwrk/ledger-v8";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import { Buffer } from "node:buffer";
import { newScheduledTimestampData } from "@effectstream/db";
import { AddressType } from "@effectstream/utils";
import { decodeOffer, OFFER_HRP } from "mip-zswap-offer";

import {
  insertOfferFile,
  insertOfferFileNullifier,
  insertOfferFileUnshieldedSpend,
  insertOfferFileToken,
  archiveOfferByNullifier,
  archiveOfferByUnshieldedSpend,
  archiveOfferByIdTtl,
  upsertSeenNullifier,
  findSeenNullifier,
  deleteSeenNullifier,
  upsertSeenUnshieldedSpend,
  findSeenUnshieldedSpend,
  deleteSeenUnshieldedSpend,
} from "@zswap-da/database";

// ─── Indexer scope and known limitations ─────────────────────────────────────
//
// This template indexes published ZSwap offers and decides whether each is
// still *open* by watching the on-chain nullifiers (shielded) and
// unshielded UTXO refs of its inputs. Two limits are intentional:
//
//   1. CONSUMED conflates *filled* and *canceled*. The indexer watches
//      input consumption only; an offer's *output commitments* are not
//      tracked, so a maker who spends the coin elsewhere is
//      indistinguishable from a successful swap. If you need
//      fill-vs-cancel attribution, extend the decoder to surface ZswapOutput
//      commitments and classify on consumption.
//
//   2. Archival is destructive (rows are DELETEd into history). If a
//      consuming Midnight/Celestia block is later reorged out, the offer
//      cannot be restored without a full resync. Only safe when
//      archive-triggering events come from finalized blocks; the
//      confirmation depth lives in the sync layer.
// ─────────────────────────────────────────────────────────────────────────────

import { grammar } from "./grammar.ts";
import { extractMidnightLedgerSnapshot } from "./zswap-logic.ts";
import { emitAppEvent } from "./event-bus.ts";
import { OFFER_TTL_SECONDS } from "./env.ts";

// Normalize a value that may be a Uint8Array or a hex string into lowercase
// hex (no `0x` prefix). Used at offer-indexing for nullifiers, owner keys,
// and intent hashes — ledger-v8 returns these as either form depending on
// the field.
function bytesOrStringToHex(value: unknown): string {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex").toLowerCase();
  }
  if (typeof value === "string") {
    const clean = value.startsWith("0x") || value.startsWith("0X")
      ? value.slice(2)
      : value;
    return clean.toLowerCase();
  }
  return String(value).toLowerCase();
}

// The Midnight indexer returns unshielded `owner` as a Bech32m-encoded
// `UnshieldedAddress` string (e.g. `mn_addr_undeployed1...`). Decode it to
// the canonical 32-byte hex form so it matches the indexing-side
// `UtxoSpend.owner` (already hex). Pass-through for already-hex inputs.
function unshieldedOwnerToCanonicalHex(value: unknown): string {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex").toLowerCase();
  }
  if (typeof value === "string") {
    if (value.includes("1")) {
      try {
        const parsed = MidnightBech32m.parse(value);
        return parsed.data.toString("hex").toLowerCase();
      } catch {
        // Not bech32m; fall through to plain hex normalization.
      }
    }
    return bytesOrStringToHex(value);
  }
  return bytesOrStringToHex(value);
}

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("midnight-nullifier", function* (data) {
  const { payload } = data.parsedInput;
  const { nullifier } = payload;

  try {
    const archived = yield* World.resolve(archiveOfferByNullifier, {
      nullifier,
    });
    if (archived.length === 0) {
      // No offer indexed yet — could be a cross-chain ordering race
      // (Midnight consumption replayed before the Celestia publish, e.g.
      // during re-sync). Persist so celestia-zswap can reconcile at index
      // time. We use the Midnight block height as `first_seen_height`.
      yield* World.resolve(upsertSeenNullifier, {
        nullifier,
        first_seen_height: data.blockHeight,
      });
      console.log(
        "[MIDNIGHT] Nullifier not matched yet — buffered in seen_nullifiers",
        nullifier,
      );
      return;
    }
    console.log("[MIDNIGHT] Archived offer(s) for nullifier", nullifier, archived);
    // One event per archived offer — multiple offers can share a nullifier.
    // Note: `offer_consumed` here conflates *filled* (the swap completed)
    // and *canceled* (maker spent the coin elsewhere); the indexer watches
    // input nullifiers only, not output commitments.
    for (const row of archived) {
      emitAppEvent({ type: "offer_consumed", offerId: row.id, nullifier });
    }
  } catch (e) {
    console.error("[MIDNIGHT] Failed to archive offer for nullifier", nullifier, e);
  }
});

// Fires once per unshielded UTXO spend observed on chain (sourced from the
// indexer's per-tx `unshieldedSpentOutputs`). Match against the
// (owner, intent_hash, output_no) triples captured at offer-publication
// time and archive any matched offer.
stm.addStateTransition("midnight-unshielded-spend", function* (data) {
  const { payload } = data.parsedInput;
  const owner = unshieldedOwnerToCanonicalHex(payload?.owner);
  const intentHash = bytesOrStringToHex(payload?.intentHash);
  const outputNoRaw = payload?.outputIndex ?? payload?.outputNo;
  const outputNo = typeof outputNoRaw === "number"
    ? outputNoRaw
    : Number(outputNoRaw);

  if (!owner || !intentHash || !Number.isFinite(outputNo)) {
    console.warn(
      "[MIDNIGHT] Skipping malformed unshielded-spend payload",
      payload,
    );
    return;
  }

  try {
    const archived = yield* World.resolve(archiveOfferByUnshieldedSpend, {
      owner,
      intent_hash: intentHash,
      output_no: outputNo,
    });
    if (archived.length === 0) {
      // Early-arrival race: buffer so a later-arriving Celestia offer
      // can reconcile. See midnight-nullifier handler for context.
      yield* World.resolve(upsertSeenUnshieldedSpend, {
        owner,
        intent_hash: intentHash,
        output_no: outputNo,
        first_seen_height: data.blockHeight,
      });
      console.log(
        "[MIDNIGHT] Unshielded spend not matched yet — buffered in seen_unshielded_spends",
        { owner, intentHash, outputNo },
      );
      return;
    }
    console.log(
      "[MIDNIGHT] Archived offer(s) for unshielded spend",
      { owner, intentHash, outputNo },
      archived,
    );
    // One event per archived offer — see midnight-nullifier for the
    // CONSUMED-conflates-filled-and-canceled caveat.
    for (const row of archived) {
      emitAppEvent({
        type: "offer_consumed",
        offerId: row.id,
        unshieldedSpend: { owner, intentHash, outputNo },
      });
    }
  } catch (e) {
    console.error(
      "[MIDNIGHT] Failed to archive offer for unshielded spend",
      { owner, intentHash, outputNo },
      e,
    );
  }
});

stm.addStateTransition("celestia-zswap", function* (data) {
  const { payload } = data.parsedInput;
  const raw = payload.suppliedValue;

  // Blob must be a bech32m `zswapoffer1…` string — no JSON envelope.
  if (typeof raw !== "string" || !raw.startsWith(`${OFFER_HRP}1`)) {
    console.error("[ZSWAP] Invalid blob: not a zswapoffer bech32m string, skipping");
    return;
  }

  // Decode bech32m → raw bytes → deserialized transaction.
  let rawTx: Uint8Array;
  try {
    rawTx = decodeOffer(raw);
  } catch (e) {
    console.error("[ZSWAP] Invalid bech32m blob, skipping", e);
    return;
  }

  // Lace-made offers (`makeIntent`) arrive as <Sig, Proof, Binding> — the wallet
  // proves+binds inside its secure context.
  let offerTx: UnprovenTransaction;
  try {
    offerTx = Transaction.deserialize(
      "signature" as const,
      "proof" as const,
      "binding" as const,
      rawTx,
    ) as UnprovenTransaction;
    console.log(`[ZSWAP] Deserialized offer at height ${data.blockHeight}`);
  } catch (e) {
    console.error("[ZSWAP] Failed to deserialize transaction as <signature, proof, binding>", e);
    return;
  }

  try {
    // ── Derive gives/wants from imbalances ──
    // 0 = guaranteed segment. Lace's makeIntent populates `intents` and may also
    // touch `fallibleOffer` depending on the kinds (shielded/unshielded) involved.
    // Union both so we capture every segment with imbalances.
    const intentKeys = (offerTx as any).intents
      ? Array.from((offerTx as any).intents.keys() as Iterable<number>)
      : [];
    const fallibleKeys = offerTx.fallibleOffer
      ? Array.from(offerTx.fallibleOffer.keys() as Iterable<number>)
      : [];
    const segmentIds: number[] = Array.from(
      new Set<number>([0, ...intentKeys, ...fallibleKeys]),
    );

    const mergedImbalances = new Map<string, bigint>();
    for (const segId of segmentIds) {
      let entries: Iterable<[TokenType, bigint]>;
      try {
        entries = offerTx.imbalances(segId);
      } catch (e) {
        // Segment IDs came from the tx itself — this shouldn't happen.
        // Partial imbalance data would produce a wrong offer, so drop it entirely.
        console.error(`[ZSWAP] imbalances(${segId}) threw at height ${data.blockHeight}`, e);
        return;
      }

      for (const [tokenType, delta] of entries) {
        const tt = tokenType as TokenType;
        if (tt.tag === 'dust') continue;
        if (tt.tag !== 'shielded' && tt.tag !== 'unshielded') {
          console.warn(`[ZSWAP] Unknown token tag "${tt.tag}" in segment ${segId}, skipping`);
          continue;
        }
        const token = tt.raw.toLowerCase();
        mergedImbalances.set(token, (mergedImbalances.get(token) ?? 0n) + delta);
      }
    }

    const gives: { token: string; amount: string }[] = [];
    const wants: { token: string; amount: string }[] = [];

    for (const [token, delta] of mergedImbalances) {
      if (delta > 0n) {
        gives.push({ token, amount: delta.toString() });
      } else if (delta < 0n) {
        wants.push({ token, amount: (-delta).toString() });
      }
    }

    // ── Insert offer ──
    const offerFileRes = yield* World.resolve(insertOfferFile, {
      celestia_height: data.blockHeight,
      transaction_hex: raw,
      metadata_created_at: new Date(data.blockTimestamp).toISOString(),
      metadata_expires_at: null,
      metadata_maker_note: null,
      auth_signer_public_key: null,
      auth_signature: null,
      auth_scheme: null,
      ttl_seconds: OFFER_TTL_SECONDS,
    });

    const offerFileId = offerFileRes[0].id;

    // ── Extract nullifiers (shielded path) ──
    // Shielded spends carry a cryptographic nullifier; the chain emits a
    // `midnight-nullifier` STM event whenever one is consumed. Cover all
    // input sources the ledger applies:
    //   - guaranteedOffer.inputs    (segment 0 spent inputs)
    //   - guaranteedOffer.transients (segment 0 input+output in same tx)
    //   - fallibleOffer[seg].inputs / .transients (each non-guaranteed segment)
    // Detection (Midnight fetcher) is segment-agnostic, so indexing must
    // match — otherwise consumed offers go un-archived until TTL.
    const shieldedOffers: any[] = [];
    if (offerTx.guaranteedOffer) shieldedOffers.push(offerTx.guaranteedOffer);
    if (offerTx.fallibleOffer && typeof (offerTx.fallibleOffer as any).values === "function") {
      for (const segOffer of (offerTx.fallibleOffer as any).values() as Iterable<any>) {
        if (segOffer) shieldedOffers.push(segOffer);
      }
    }
    const nullifierStrs: string[] = [];
    for (const o of shieldedOffers) {
      for (const input of o.inputs ?? []) nullifierStrs.push(bytesOrStringToHex(input.nullifier));
      for (const t of o.transients ?? []) nullifierStrs.push(bytesOrStringToHex(t.nullifier));
    }
    for (const nullifierStr of nullifierStrs) {
      yield* World.resolve(insertOfferFileNullifier, {
        offer_file_id: offerFileId,
        nullifier: nullifierStr,
      });
    }

    // ── Extract unshielded UTXO refs (unshielded path) ──
    // Unshielded inputs have no nullifier; they're identified by the
    // (owner, intentHash, outputNo) triple of `UtxoSpend` records on each
    // Intent's guaranteed/fallible UnshieldedOffer. Capture them so the
    // `midnight-unshielded-spend` STM event can match-and-archive when the
    // chain consumes one of these UTXOs.
    //
    // `UtxoSpend.owner` is a raw SignatureVerifyingKey — distinct from the
    // 32-byte address that the indexer reports on consumption. Apply
    // `addressFromKey` so both sides of the lookup store the same address.
    const unshieldedSpends: Array<{ owner: string; intent_hash: string; output_no: number }> = [];
    const intents = (offerTx as any).intents;
    if (intents && typeof intents.values === "function") {
      for (const intent of intents.values() as Iterable<any>) {
        const unshieldedOffers = [
          intent.guaranteedUnshieldedOffer,
          intent.fallibleUnshieldedOffer,
        ].filter(Boolean);
        for (const offer of unshieldedOffers) {
          for (const spend of offer.inputs ?? []) {
            const ownerSvk = bytesOrStringToHex(spend.owner);
            const ownerAddr = addressFromKey(ownerSvk).toLowerCase();
            unshieldedSpends.push({
              owner: ownerAddr,
              intent_hash: bytesOrStringToHex(spend.intentHash).toLowerCase(),
              output_no: Number(spend.outputNo),
            });
          }
        }
      }
    }
    for (const s of unshieldedSpends) {
      yield* World.resolve(insertOfferFileUnshieldedSpend, {
        offer_file_id: offerFileId,
        ...s,
      });
    }

    // ── Insert derived gives/wants ──
    // Must come before the early-arrival reconciliation below: the archive
    // queries copy these into offer_file_tokens_history in one statement,
    // so they have to exist when the archive runs.
    for (const g of gives) {
      yield* World.resolve(insertOfferFileToken, {
        offer_file_id: offerFileId,
        token_color: g.token,
        amount: g.amount,
        direction: "GIVING",
      });
    }
    for (const w of wants) {
      yield* World.resolve(insertOfferFileToken, {
        offer_file_id: offerFileId,
        token_color: w.token,
        amount: w.amount,
        direction: "WANTING",
      });
    }

    // ── Reconcile against early-arrival buffer ──
    // If a Midnight consumption event was processed before this offer was
    // indexed (race during re-sync / replay), it lives in seen_* tables.
    // Archive the offer immediately so it doesn't get served as active.
    let archivedEarly = false;
    for (const nullifierStr of nullifierStrs) {
      const seen = yield* World.resolve(findSeenNullifier, { nullifier: nullifierStr });
      if (seen.length === 0) continue;
      const archived = yield* World.resolve(archiveOfferByNullifier, { nullifier: nullifierStr });
      yield* World.resolve(deleteSeenNullifier, { nullifier: nullifierStr });
      for (const row of archived) {
        emitAppEvent({ type: "offer_consumed", offerId: row.id, nullifier: nullifierStr });
      }
      if (archived.length > 0) archivedEarly = true;
    }
    if (!archivedEarly) {
      for (const s of unshieldedSpends) {
        const seen = yield* World.resolve(findSeenUnshieldedSpend, s);
        if (seen.length === 0) continue;
        const archived = yield* World.resolve(archiveOfferByUnshieldedSpend, s);
        yield* World.resolve(deleteSeenUnshieldedSpend, s);
        for (const row of archived) {
          emitAppEvent({
            type: "offer_consumed",
            offerId: row.id,
            unshieldedSpend: { owner: s.owner, intentHash: s.intent_hash, outputNo: s.output_no },
          });
        }
        if (archived.length > 0) archivedEarly = true;
      }
    }
    if (archivedEarly) {
      console.log(
        `[ZSWAP] Offer ${offerFileId} archived at index-time (early-arrival consumption)`,
      );
      return;
    }

    // Schedule a follow-up STM input to run after the TTL expires.
    yield* World.resolve(newScheduledTimestampData, {
      from_address: "0x0",
      from_address_type: AddressType.NONE,
      future_ms_timestamp: new Date(data.blockTimestamp + OFFER_TTL_SECONDS * 1000),
      input_data: JSON.stringify(["zswap-ttl-cleanup", offerFileId]),
    });

    console.log(`[ZSWAP] Saved at Celestia block ${data.blockHeight}`);
    emitAppEvent({ type: "offer_indexed", offerId: offerFileId, celestiaHeight: data.blockHeight, gives, wants });
  } catch (e) {
    console.error("[ZSWAP] Failed to save offer file", e);
  }
});

stm.addStateTransition("midnight-zswap", function* (data) {
  const snapshot = extractMidnightLedgerSnapshot(data.parsedInput.payload);
  if (!snapshot) return;

  console.log(
    `[MIDNIGHT] Ledger snapshot at block ${data.blockHeight}`,
    snapshot,
  );
});

// Scheduled TTL cleanup: if the offer is still active in the main table,
// move it to history and mark it as archived due to TTL.
stm.addStateTransition("zswap-ttl-cleanup", function* (data) {
  const { offerId } = data.parsedInput;

  try {
    const archived = yield* World.resolve(archiveOfferByIdTtl, {
      offer_file_id: offerId,
    });

    if (archived.length === 0) {
      console.log(
        "[ZSWAP] TTL cleanup: offer already consumed or missing",
        offerId,
      );
      return;
    }

    console.log(
      "[ZSWAP] TTL cleanup archived offer",
      offerId,
      archived,
    );
    emitAppEvent({ type: "offer_expired", offerId });
  } catch (e) {
    console.error(
      "[ZSWAP] Failed to archive offer by TTL",
      offerId,
      e,
    );
  }
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
