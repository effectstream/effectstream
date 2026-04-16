import type { GrammarDefinition } from "@effectstream/concise";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { PaimaSTM } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import { builtinGrammars } from "@effectstream/sm/grammar";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { Transaction, type UnprovenTransaction, type TokenType } from "@midnight-ntwrk/ledger-v8";
import { Buffer } from "node:buffer";
import { newScheduledTimestampData } from "@effectstream/db";
import { AddressType } from "@effectstream/utils";
import { Type } from "@sinclair/typebox";
import { decodeOffer, OFFER_HRP } from "mip-zswap-offer";

import {
  insertOfferFile,
  insertOfferFileNullifier,
  insertOfferFileToken,
  archiveOfferByNullifier,
  archiveOfferByIdTtl,
} from "@zswap-da/database";

import { extractMidnightLedgerSnapshot } from "./zswap-logic.ts";
import { emitAppEvent } from "./event-bus.ts";

export const grammar = {
  // Primitives
  "celestia-zswap": builtinGrammars.celestiaGeneric,
  "midnight-zswap": builtinGrammars.midnightGeneric,
  "midnight-nullifier": [["payload", Type.Any()]],

  // Scheduled game input used for TTL cleanup.
  "zswap-ttl-cleanup": [["offerId", Type.Integer()]],
} as const satisfies GrammarDefinition;

const stm = new PaimaSTM<typeof grammar, {}>(grammar);

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

  let offerTx: UnprovenTransaction;
  try {
    offerTx = Transaction.deserialize(
      "signature" as const,
      "pre-proof" as const,
      "pre-binding" as const,
      rawTx,
    ) as UnprovenTransaction;
  } catch (e) {
    console.error("[ZSWAP] Failed to deserialize transaction", e);
    return;
  }

  try {
    // ── Derive gives/wants from imbalances ──
    // ledger-v8 API: imbalances(segment: number) where 0 = guaranteed,
    // and fallible segment IDs come from offerTx.fallibleOffer.keys()
    const segmentIds: number[] = [0];
    const fallibleOfferMap = offerTx.fallibleOffer;
    if (fallibleOfferMap) {
      for (const segId of fallibleOfferMap.keys()) {
        segmentIds.push(segId);
      }
    }

    const mergedImbalances = new Map<string, bigint>();
    for (const segId of segmentIds) {
      try {
        for (const [tokenType, delta] of offerTx.imbalances(segId)) {
          const tt = tokenType as TokenType;
          if (tt.tag === 'dust') continue; // skip fee token
          const token = tt.raw.toLowerCase();
          mergedImbalances.set(token, (mergedImbalances.get(token) ?? 0n) + delta);
        }
      } catch {
        // segment doesn't exist for this transaction, skip
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

    const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

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
      ttl_seconds: DEFAULT_TTL_SECONDS,
    });

    const offerFileId = offerFileRes[0].id;

    // ── Extract nullifiers ──
    const nullifiers: string[] = offerTx.guaranteedOffer
      ? offerTx.guaranteedOffer.inputs.map((input: any) => input.nullifier)
      : [];
    for (const nullifier of nullifiers) {
      const nullifierStr = typeof nullifier === "string" ? nullifier : Buffer.from(nullifier).toString("hex");
      yield* World.resolve(insertOfferFileNullifier, {
        offer_file_id: offerFileId,
        nullifier: nullifierStr,
      });
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
      future_ms_timestamp: new Date(data.blockTimestamp + DEFAULT_TTL_SECONDS * 1000),
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
