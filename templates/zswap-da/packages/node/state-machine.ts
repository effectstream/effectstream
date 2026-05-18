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
} from "@zswap-da/database";

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
      console.log("[MIDNIGHT] Nullifier not found in offer_file_nullifiers", nullifier);
      return;
    }
    console.log("[MIDNIGHT] Archived offer(s) for nullifier", nullifier, archived);
    emitAppEvent({ type: "offer_consumed", offerId: archived[0].id, nullifier });
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
      console.log(
        "[MIDNIGHT] Unshielded spend not matched in offer_file_unshielded_spends",
        { owner, intentHash, outputNo },
      );
      return;
    }
    console.log(
      "[MIDNIGHT] Archived offer(s) for unshielded spend",
      { owner, intentHash, outputNo },
      archived,
    );
    emitAppEvent({
      type: "offer_consumed",
      offerId: archived[0].id,
      unshieldedSpend: { owner, intentHash, outputNo },
    });
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
    // Shielded inputs at segment 0 carry a cryptographic nullifier; the
    // chain emits a `midnight-nullifier` STM event when one is consumed.
    const nullifiers: string[] = offerTx.guaranteedOffer
      ? offerTx.guaranteedOffer.inputs.map((input: any) => input.nullifier)
      : [];
    for (const nullifier of nullifiers) {
      const nullifierStr = bytesOrStringToHex(nullifier);
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
            yield* World.resolve(insertOfferFileUnshieldedSpend, {
              offer_file_id: offerFileId,
              owner: ownerAddr,
              intent_hash: bytesOrStringToHex(spend.intentHash).toLowerCase(),
              output_no: Number(spend.outputNo),
            });
          }
        }
      }
    }

    // ── Insert derived gives/wants ──
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
