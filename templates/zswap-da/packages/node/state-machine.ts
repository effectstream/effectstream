import type { GrammarDefinition } from "@effectstream/concise";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { PaimaSTM } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import { builtinGrammars } from "@effectstream/sm/grammar";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { Transaction, type UnprovenTransaction } from "@midnight-ntwrk/ledger-v7";
import { Buffer } from "node:buffer";

import {
  insertOfferFile,
  insertOfferFileNullifier,
  insertOfferFileToken,
} from "@zswap-da/database";

import { extractMidnightLedgerSnapshot } from "./zswap-logic.ts";

export const grammar = {
  "celestia-zswap": builtinGrammars.celestiaGeneric,
  "midnight-zswap": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;

const stm = new PaimaSTM<typeof grammar, {}>(grammar);

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
    const offerFileRes = yield* World.resolve(insertOfferFile, {
      celestia_height: data.blockHeight,
      transaction_hex: parsed.transaction,
      metadata_created_at: parsed.metadata?.createdAt,
      metadata_expires_at: parsed.metadata?.expiresAt,
      metadata_maker_note: parsed.metadata?.makerNote,
      auth_signer_public_key: parsed.auth?.signerPublicKey,
      auth_signature: parsed.auth?.signature,
      auth_scheme: parsed.auth?.scheme,
      is_active: true,
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
        const hex = Buffer.from(nullifier).toString("hex");
        yield* World.resolve(insertOfferFileNullifier, {
          offer_file_id: offerFileId,
          nullifier: Buffer.from(hex, "hex").toString("ascii").padStart(72, "0"),
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

    console.log(`🌌 [ZSWAP] Saved at Celestia block ${data.blockHeight}`);
  } catch (e) {
    console.error("[ZSWAP] Failed to save offer file", e);
  }
});

stm.addStateTransition("midnight-zswap", function* (data) {
  const snapshot = extractMidnightLedgerSnapshot(data.parsedInput.payload);
  if (!snapshot) return;

  console.log(
    `🌌 [MIDNIGHT] Ledger snapshot at block ${data.blockHeight}`,
    snapshot,
  );
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

