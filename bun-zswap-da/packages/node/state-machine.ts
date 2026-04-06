import type { GrammarDefinition } from "@effectstream/concise";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { PaimaSTM } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import { builtinGrammars } from "@effectstream/sm/grammar";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { Transaction, type UnprovenTransaction } from "@midnight-ntwrk/ledger-v8";
import { Buffer } from "node:buffer";
import { newScheduledTimestampData } from "@effectstream/db";
import { AddressType } from "@effectstream/utils";
import { Type } from "@sinclair/typebox";

import {
  insertOfferFile,
  insertOfferFileNullifier,
  insertOfferFileToken,
  archiveOfferByNullifier,
  archiveOfferByIdTtl,
} from "@zswap-da/database";

import { extractMidnightLedgerSnapshot } from "./zswap-logic.ts";

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
  } catch (e) {
    console.error("[MIDNIGHT] Failed to archive offer for nullifier", nullifier, e);
  }
});

stm.addStateTransition("celestia-zswap", function* (data) {
  const { payload } = data.parsedInput;
  const raw = payload.suppliedValue;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[ZSWAP] Failed to parse payload", raw);
    return;
  }

  if (
    parsed.version !== 1 ||
    typeof parsed.transaction !== "string" ||
    !Array.isArray(parsed.wants) ||
    !Array.isArray(parsed.gives)
  ) {
    console.error("[ZSWAP] Invalid payload", parsed);
    return;
  }

  try {
    const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
    const ttlSecondsRaw = parsed.metadata?.ttlSeconds;
    const ttlSeconds =
      typeof ttlSecondsRaw === "number" && Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw > 0
        ? Math.floor(ttlSecondsRaw)
        : DEFAULT_TTL_SECONDS;

    const offerFileRes = yield* World.resolve(insertOfferFile, {
      celestia_height: data.blockHeight,
      transaction_hex: parsed.transaction,
      metadata_created_at: parsed.metadata?.createdAt,
      metadata_expires_at: parsed.metadata?.expiresAt,
      metadata_maker_note: parsed.metadata?.makerNote,
      auth_signer_public_key: parsed.auth?.signerPublicKey,
      auth_signature: parsed.auth?.signature,
      auth_scheme: parsed.auth?.scheme,
      ttl_seconds: ttlSeconds,
    });

    const offerFileId = offerFileRes[0].id;

    let rawTx: Uint8Array;
    try {
      rawTx = Uint8Array.from(atob(parsed.transaction), (c) => c.charCodeAt(0));
      const offerTx = Transaction.deserialize(
        "signature" as const,
        "pre-proof" as const,
        "pre-binding" as const,
        rawTx,
      ) as UnprovenTransaction;

      const nullifiers: string[] = offerTx.guaranteedOffer
        ? offerTx.guaranteedOffer.inputs.map((input: any) => input.nullifier)
        : [];
      for (const nullifier of nullifiers) {
        // nullifier is already a hex string from the deserialized transaction
        const nullifierStr = typeof nullifier === "string" ? nullifier : Buffer.from(nullifier).toString("hex");
        yield* World.resolve(insertOfferFileNullifier, {
          offer_file_id: offerFileId,
          nullifier: nullifierStr,
        });
      }
    } catch (e) {
      console.error(
        "[ZSWAP] Failed to parse transaction to extract nullifiers",
        e,
      );
    }

    for (const want of parsed.wants) {
      yield* World.resolve(insertOfferFileToken, {
        offer_file_id: offerFileId,
        token_color: want.token,
        amount: want.amount.toString(),
        direction: "WANTING",
      });
    }

    for (const give of parsed.gives) {
      yield* World.resolve(insertOfferFileToken, {
        offer_file_id: offerFileId,
        token_color: give.token,
        amount: give.amount.toString(),
        direction: "GIVING",
      });
    }

    // Schedule a follow-up STM input to run after the TTL expires.
    yield* World.resolve(newScheduledTimestampData, {
      from_address: "0x0",
      from_address_type: AddressType.NONE,
      future_ms_timestamp: new Date(data.blockTimestamp + ttlSeconds * 1000),
      input_data: JSON.stringify(["zswap-ttl-cleanup", offerFileId]),
    });

    console.log(`[ZSWAP] Saved at Celestia block ${data.blockHeight}`);
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
