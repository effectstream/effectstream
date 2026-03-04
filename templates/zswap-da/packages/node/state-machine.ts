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
import { archiveOfferByNullifier } from "@zswap-da/database";

import { extractMidnightLedgerSnapshot } from "./zswap-logic.ts";

export const grammar = {
  "celestia-zswap": builtinGrammars.celestiaGeneric,
  "midnight-zswap": builtinGrammars.midnightGeneric,
  "midnight-nullifier": builtinGrammars.midnightNullifier,
} as const satisfies GrammarDefinition;

const stm = new PaimaSTM<typeof grammar, {}>(grammar);

stm.addStateTransition("midnight-nullifier", function* (data) {
  const { payload } = data.parsedInput;
  // {                                                                                        │ [✓] 98490    collector             deno -A @effectstream/grafana-alloy grafana-alloy
  //   nullifier: "00000000d4d29d97e1c4f4417a8162e5a99a7d20dbb958111ae7f401520f40ad",                                                                 │ [✓] 98600    pglite                deno run -A @effectstream/db/start-pglite --port 5432
  //   txHash: "04001901c7da9522a9ea787bfbb20a883753075a02cd229c096e8f5568a0fe0b",                                                                    │ [✗] 98732    midnight-node         deno task -f @zswap-da/midnight-contracts midnight-node:start
  //   eventId: 65,                                                                                                                                   │ [✗] 98764    midnight-indexer      deno task -f @zswap-da/midnight-contracts midnight-indexer:start
  //   logicalSegment: 61663                                                                                                                          │ [✗] 98765    midnight-proof-server deno task -f @zswap-da/midnight-contracts midnight-proof-server:start
  // }
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
    const offerFileRes = yield* World.resolve(insertOfferFile, {
      celestia_height: data.blockHeight,
      transaction_hex: parsed.transaction,
      metadata_created_at: parsed.metadata?.createdAt,
      metadata_expires_at: parsed.metadata?.expiresAt,
      metadata_maker_note: parsed.metadata?.makerNote,
      auth_signer_public_key: parsed.auth?.signerPublicKey,
      auth_signature: parsed.auth?.signature,
      auth_scheme: parsed.auth?.scheme,
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

