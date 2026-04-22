import "@midnight-ntwrk/onchain-runtime-v3";

import { init, start, type StartConfigGameStateTransitions } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { getConnection } from "@effectstream/db";
import { newScheduledTimestampData } from "@effectstream/db";
import { AddressType } from "@effectstream/utils";
import { Buffer } from "node:buffer";
import { Transaction, type UnprovenTransaction } from "@midnight-ntwrk/ledger-v8";

import { config } from "./config.ts";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);
const pool = getConnection();

// ── Celestia ZSwap blob handler ───────────────────────────────────────────────

stm.addStateTransition("celestia-zswap", function* (data) {
  const { payload } = data.parsedInput;
  const raw = payload.suppliedValue;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[STM] celestia-zswap: Failed to parse payload");
    return;
  }

  if (
    parsed.version !== 1 ||
    typeof parsed.transaction !== "string" ||
    !Array.isArray(parsed.wants) ||
    !Array.isArray(parsed.gives)
  ) {
    console.error("[STM] celestia-zswap: Invalid payload structure");
    return;
  }

  try {
    const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
    const ttlSeconds = parsed.metadata?.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    const offerRes = yield* World.promise(pool.query(
      `INSERT INTO offer_file (celestia_height, transaction_hex, metadata_created_at, metadata_expires_at, metadata_maker_note, ttl_seconds)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        data.blockHeight,
        parsed.transaction,
        parsed.metadata?.createdAt ?? null,
        parsed.metadata?.expiresAt ?? null,
        parsed.metadata?.makerNote ?? null,
        ttlSeconds,
      ],
    ));
    const offerFileId = offerRes.rows[0].id;

    // Extract nullifiers from the serialized transaction so we can match them later
    try {
      const rawTx = Uint8Array.from(atob(parsed.transaction), (c) => c.charCodeAt(0));
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
        const nullifierStr = typeof nullifier === "string"
          ? nullifier
          : Buffer.from(nullifier).toString("hex");
        yield* World.promise(pool.query(
          `INSERT INTO offer_file_nullifiers (offer_file_id, nullifier) VALUES ($1, $2) ON CONFLICT (nullifier) DO NOTHING`,
          [offerFileId, nullifierStr],
        ));
        console.log(`[STM] celestia-zswap: Stored nullifier ${nullifierStr} for offer ${offerFileId}`);
      }
    } catch (e) {
      console.error("[STM] celestia-zswap: Failed to extract nullifiers from transaction", e);
    }

    for (const want of parsed.wants) {
      yield* World.promise(pool.query(
        `INSERT INTO offer_file_tokens (offer_file_id, token_color, amount, direction) VALUES ($1, $2, $3, $4)`,
        [offerFileId, want.token, want.amount.toString(), "WANTING"],
      ));
    }

    for (const give of parsed.gives) {
      yield* World.promise(pool.query(
        `INSERT INTO offer_file_tokens (offer_file_id, token_color, amount, direction) VALUES ($1, $2, $3, $4)`,
        [offerFileId, give.token, give.amount.toString(), "GIVING"],
      ));
    }

    // Schedule TTL cleanup
    yield* World.resolve(newScheduledTimestampData, {
      from_address: "0x0",
      from_address_type: AddressType.NONE,
      future_ms_timestamp: new Date(data.blockTimestamp + ttlSeconds * 1000),
      input_data: JSON.stringify(["zswap-ttl-cleanup", offerFileId]),
    });

    console.log(`[STM] celestia-zswap: Stored offer ${offerFileId} at Celestia block ${data.blockHeight}`);
  } catch (e) {
    console.error("[STM] celestia-zswap: Failed to store offer", e);
  }
});

// ── Midnight nullifier handler ────────────────────────────────────────────────

stm.addStateTransition("midnight-nullifier", function* (data) {
  const { payload } = data.parsedInput;
  const { nullifier } = payload;

  try {
    // Check if this nullifier matches an active offer
    const matchRes = yield* World.promise(pool.query(
      `SELECT offer_file_id FROM offer_file_nullifiers WHERE nullifier = $1 LIMIT 1`,
      [nullifier],
    ));

    if (matchRes.rows.length > 0) {
      const offerId = matchRes.rows[0].offer_file_id;

      // Archive to history
      yield* World.promise(pool.query(
        `INSERT INTO offer_file_history (id, celestia_height, transaction_hex, metadata_created_at, metadata_expires_at, metadata_maker_note, created_at, ttl_seconds, archive_reason)
         SELECT id, celestia_height, transaction_hex, metadata_created_at, metadata_expires_at, metadata_maker_note, created_at, ttl_seconds, 'CONSUMED'
         FROM offer_file WHERE id = $1`,
        [offerId],
      ));
      yield* World.promise(pool.query(
        `DELETE FROM offer_file WHERE id = $1`,
        [offerId],
      ));

      console.log(`[STM] midnight-nullifier: Archived consumed offer ${offerId}`);
    } else {
      // Still record the nullifier for reference
      yield* World.promise(pool.query(
        `INSERT INTO midnight_nullifiers (nullifier, block_height) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [nullifier, data.blockHeight],
      ));
    }
  } catch (e) {
    console.error("[STM] midnight-nullifier: Error processing", nullifier, e);
  }
});

// ── Midnight generic state handler ────────────────────────────────────────────

stm.addStateTransition("midnight-zswap", function* (data) {
  const payloadJson = JSON.stringify(data.parsedInput.payload);
  yield* World.promise(pool.query(
    `INSERT INTO midnight_state (block_height, payload_json) VALUES ($1, $2)`,
    [data.blockHeight, payloadJson],
  ));
  console.log(`[STM] midnight-zswap: Ledger state at block ${data.blockHeight}`);
});

// ── TTL cleanup ───────────────────────────────────────────────────────────────

stm.addStateTransition("zswap-ttl-cleanup", function* (data) {
  const { offerId } = data.parsedInput;

  try {
    const res = yield* World.promise(pool.query(
      `INSERT INTO offer_file_history (id, celestia_height, transaction_hex, metadata_created_at, metadata_expires_at, metadata_maker_note, created_at, ttl_seconds, archive_reason)
       SELECT id, celestia_height, transaction_hex, metadata_created_at, metadata_expires_at, metadata_maker_note, created_at, ttl_seconds, 'TTL'
       FROM offer_file WHERE id = $1 RETURNING id`,
      [offerId],
    ));

    if (res.rows.length > 0) {
      yield* World.promise(pool.query(`DELETE FROM offer_file WHERE id = $1`, [offerId]));
      console.log(`[STM] zswap-ttl-cleanup: Archived expired offer ${offerId}`);
    }
  } catch (e) {
    console.error("[STM] zswap-ttl-cleanup: Error", offerId, e);
  }
});

// ── Router ────────────────────────────────────────────────────────────────────

const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ── Main ──────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting E2E ZSwap-DA Sync Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-zswap-da",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: [],
      grammar,
    });
  });

  yield* suspend();
});
