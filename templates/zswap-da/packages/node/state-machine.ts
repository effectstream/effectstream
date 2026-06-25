import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import { Buffer } from "node:buffer";
import { newScheduledTimestampData } from "@effectstream/db";
import { AddressType } from "@effectstream/utils";
import { getBlankRefState, validateZswapOffer } from "@zswap-da/validator";

import {
  insertKnownToken,
  insertOfferFile,
  insertOfferFileNullifier,
  insertOfferFileUnshieldedSpend,
  insertOfferFileToken,
  archiveOfferByNullifier,
  archiveOfferByUnshieldedSpend,
  archiveOfferByIdTtl,
  upsertNullifier,
  markNullifierMatched,
  findUnmatchedNullifier,
  pruneStaleNullifiers,
  isNullifierSpent,
  insertCreatedUnshielded,
  deleteCreatedUnshielded,
  isUnshieldedCreated,
  upsertKnownRoot,
  isKnownRoot,
  pruneKnownRoots,
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

import { canonicalRootHex } from "@zswap-da/validator";

import { grammar } from "./grammar.ts";
import { extractMidnightLedgerSnapshot } from "./zswap-logic.ts";
import { emitAppEvent } from "./event-bus.ts";
import {
  MIDNIGHT_NETWORK_ID,
  OFFER_MAX_BYTES,
  OFFER_TTL_SECONDS,
  ROOT_WINDOW_SECONDS,
  SEEN_NULLIFIER_TTL_SECONDS,
} from "./env.ts";

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
    // Upsert into the unified nullifiers table. offer_matched=false initially;
    // if the offer was already indexed (or is indexed later), it gets flipped
    // to true via markNullifierMatched.
    yield* World.resolve(upsertNullifier, {
      nullifier,
      height: data.blockHeight,
    });

    const archived = yield* World.resolve(archiveOfferByNullifier, {
      nullifier,
    });
    if (archived.length === 0) {
      // No offer indexed yet — early-arrival race. The row stays in
      // nullifiers with offer_matched=false; celestia-zswap will flip it
      // when the offer arrives. TTL prune (below) cleans up strays.
      console.log(
        "[MIDNIGHT] Nullifier not matched yet — buffered in nullifiers",
        nullifier,
      );
    } else {
      // Flip to matched so the row survives TTL prune.
      yield* World.resolve(markNullifierMatched, { nullifier });
      console.log("[MIDNIGHT] Archived offer(s) for nullifier", nullifier, archived);
      for (const row of archived) {
        emitAppEvent({ type: "offer_consumed", offerId: row.id, nullifier });
      }
    }

    // Throttled prune: fire roughly once per ~1000 nullifier events to keep
    // the table lean without hammering the DB on every event. Not exact —
    // blockHeight is a proxy for "periodic enough".
    if (data.blockHeight % 1000 === 0) {
      const cutoff = new Date(Date.now() - SEEN_NULLIFIER_TTL_SECONDS * 1000);
      yield* World.resolve(pruneStaleNullifiers, { cutoff_at: cutoff });
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
    // Delete from created_unshielded — the row's absence is the "spent" signal.
    // If no offer is currently indexed for this UTXO, the delete is still
    // correct: a later Celestia offer will see no row and be rejected.
    yield* World.resolve(deleteCreatedUnshielded, {
      owner,
      intent_hash: intentHash,
      output_no: outputNo,
    });

    const archived = yield* World.resolve(archiveOfferByUnshieldedSpend, {
      owner,
      intent_hash: intentHash,
      output_no: outputNo,
    });
    if (archived.length === 0) {
      console.log(
        "[MIDNIGHT] Unshielded spend — no active offer matched",
        { owner, intentHash, outputNo },
      );
    } else {
      console.log(
        "[MIDNIGHT] Archived offer(s) for unshielded spend",
        { owner, intentHash, outputNo },
        archived,
      );
      for (const row of archived) {
        emitAppEvent({
          type: "offer_consumed",
          offerId: row.id,
          unshieldedSpend: { owner, intentHash, outputNo },
        });
      }
    }
  } catch (e) {
    console.error(
      "[MIDNIGHT] Failed to archive offer for unshielded spend",
      { owner, intentHash, outputNo },
      e,
    );
  }
});

// Fires once per unshielded UTXO *created* on chain (regular AND system txs).
// Records the (owner, intent_hash, output_no) triple in the permanent
// created_unshielded set so the offer validator can reject offers that
// reference a UTXO the chain never created (existence check).
stm.addStateTransition("midnight-unshielded-create", function* (data) {
  const { payload } = data.parsedInput;
  const owner = unshieldedOwnerToCanonicalHex(payload?.owner);
  const intentHash = bytesOrStringToHex(payload?.intentHash);
  const outputNoRaw = payload?.outputIndex ?? payload?.outputNo;
  const outputNo = typeof outputNoRaw === "number"
    ? outputNoRaw
    : Number(outputNoRaw);

  if (!owner || !intentHash || !Number.isFinite(outputNo)) {
    console.warn("[MIDNIGHT] Skipping malformed unshielded-create payload", payload);
    return;
  }

  try {
    yield* World.resolve(insertCreatedUnshielded, {
      owner,
      intent_hash: intentHash,
      output_no: outputNo,
      height: data.blockHeight,
    });
  } catch (e) {
    console.error(
      "[MIDNIGHT] Failed to record created unshielded UTXO",
      { owner, intentHash, outputNo },
      e,
    );
  }
});

// Fires once per block whose coin-commitment tree root advanced. Records the
// root in the windowed known_roots set and prunes roots older than the root
// window, mirroring the ledger's `past_roots`. The offer validator checks an
// offer's input root against this set (root-known liveness). Deterministic:
// keyed on the block timestamp, never wall-clock.
stm.addStateTransition("midnight-zswap-root", function* (data) {
  const root = canonicalRootHex(String(data.parsedInput.payload?.root ?? ""));
  if (!root) {
    console.warn("[MIDNIGHT] Skipping empty zswap-root payload");
    return;
  }
  try {
    yield* World.resolve(upsertKnownRoot, {
      root,
      height: data.blockHeight,
      last_seen_ms: data.blockTimestamp,
    });
    yield* World.resolve(pruneKnownRoots, {
      cutoff_ms: data.blockTimestamp - ROOT_WINDOW_SECONDS * 1000,
    });
  } catch (e) {
    console.error("[MIDNIGHT] Failed to record zswap root", root, e);
  }
});

stm.addStateTransition("celestia-zswap", function* (data) {
  const { payload } = data.parsedInput;
  const raw = payload.suppliedValue;

  // ── Validate the offer (structure + cryptographic proofs) ──
  // Deterministic: the verdict is a pure function of (raw, refState, tblock).
  // `tblock` is the Celestia block time and `refState` is a blank ledger state
  // for the configured network, so it replays identically. Anyone can post a
  // blob directly to the public Celestia namespace, so we must validate
  // defensively even though /api/zswap/submit and the batcher also gate.
  const result = validateZswapOffer(raw, {
    refState: getBlankRefState(MIDNIGHT_NETWORK_ID),
    tblock: new Date(data.blockTimestamp),
    maxBytes: OFFER_MAX_BYTES,
  });
  if (!result.ok) {
    console.warn("[ZSWAP] Rejected offer", {
      code: result.code,
      reason: result.reason,
      celestiaHeight: data.blockHeight,
    });
    emitAppEvent({
      type: "offer_rejected",
      code: result.code,
      reason: result.reason,
      celestiaHeight: data.blockHeight,
    });
    return;
  }

  const nullifierStrs = result.nullifiers ?? [];
  const unshieldedSpends = (result.unshieldedSpends ?? []).map((s) => ({
    owner: s.owner,
    intent_hash: s.intentHash,
    output_no: s.outputNo,
  }));
  const gives = result.gives ?? [];
  const wants = result.wants ?? [];

  // ── Liveness: drop offers whose coins are already spent on chain ──
  // The midnight-* handlers ingest every consumed nullifier / unshielded UTXO
  // into the permanent spent_* sets, so these are a plain existence check. We
  // do NOT compare heights across chains (Midnight height ≠ Celestia height);
  // determinism comes from the rollup's fixed input ordering. An already-spent
  // coin means the offer can never settle, so it must not be indexed.
  for (const nullifier of nullifierStrs) {
    const spent = yield* World.resolve(isNullifierSpent, { nullifier });
    if (spent.length > 0) {
      console.warn("[ZSWAP] Rejected offer: nullifier already spent", {
        nullifier,
        celestiaHeight: data.blockHeight,
      });
      emitAppEvent({
        type: "offer_rejected",
        code: "NULLIFIER_SPENT",
        celestiaHeight: data.blockHeight,
      });
      return;
    }
  }
  // ── Existence + liveness for unshielded UTXOs ──
  // created_unshielded is a live-set: midnight-unshielded-create inserts,
  // midnight-unshielded-spend deletes. A missing row means either the UTXO
  // was never created OR it has already been spent — both mean reject.
  for (const s of unshieldedSpends) {
    const created = yield* World.resolve(isUnshieldedCreated, s);
    if (created.length === 0) {
      console.warn("[ZSWAP] Rejected offer: unshielded UTXO not live (never created or already spent)", {
        ...s,
        celestiaHeight: data.blockHeight,
      });
      emitAppEvent({
        type: "offer_rejected",
        code: "UTXO_NOT_LIVE",
        celestiaHeight: data.blockHeight,
      });
      return;
    }
  }

  // ── Root-known: drop offers whose shielded input proves against a root the
  // chain never held / that has aged out (midnight-zswap-root populates
  // known_roots). inputRoots are canonical hex == the indexer's root form. ──
  for (const root of result.inputRoots ?? []) {
    const known = yield* World.resolve(isKnownRoot, { root });
    if (known.length === 0) {
      console.warn("[ZSWAP] Rejected offer: input merkle root unknown", {
        root,
        celestiaHeight: data.blockHeight,
      });
      emitAppEvent({
        type: "offer_rejected",
        code: "ROOT_UNKNOWN",
        celestiaHeight: data.blockHeight,
      });
      return;
    }
  }

  try {
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

    // ── Persist spend refs (derived + validated above) ──
    // nullifierStrs covers guaranteed + fallible segments, inputs + transients;
    // unshieldedSpends carries the (owner, intentHash, outputNo) triples with
    // owner already normalized via addressFromKey so the midnight-* consumption
    // events match. Both must be inserted before the early-arrival
    // reconciliation, which copies them into the history tables in one shot.
    for (const nullifier of nullifierStrs) {
      yield* World.resolve(insertOfferFileNullifier, {
        offer_file_id: offerFileId,
        nullifier,
      });
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

    // ── Auto-register new token colors ──
    // DEMO / TEMPORARY: known_tokens is a manually curated convenience table.
    // The Midnight token-metadata standard is not yet live — names written here
    // are placeholder abbreviations and MUST NOT be trusted as authoritative.
    // Any token color appearing in this offer that isn't already in
    // known_tokens gets a placeholder entry. ON CONFLICT DO NOTHING means
    // existing entries (including the pre-seeded NIGHT token) are never
    // overwritten. kind is always 'shielded': ZSwap offers are structurally
    // shielded-only; unshielded tokens only appear inside Intent structures.
    const seenColors = new Set<string>();
    for (const t of [...gives, ...wants]) {
      if (seenColors.has(t.token)) continue;
      seenColors.add(t.token);
      yield* World.resolve(insertKnownToken, {
        token_color: t.token,
        name: `${t.token.slice(0, 3)}...${t.token.slice(-3)}`,
        kind: "shielded",
      });
    }

    // ── Reconcile against early-arrival buffer ──
    // If a Midnight consumption event was processed before this offer was
    // indexed (race during re-sync / replay), the nullifier row exists with
    // offer_matched=false. Archive immediately and flip to matched so the
    // row persists as a permanent validator record.
    let archivedEarly = false;
    for (const nullifierStr of nullifierStrs) {
      const seen = yield* World.resolve(findUnmatchedNullifier, { nullifier: nullifierStr });
      if (seen.length === 0) continue;
      const archived = yield* World.resolve(archiveOfferByNullifier, { nullifier: nullifierStr });
      yield* World.resolve(markNullifierMatched, { nullifier: nullifierStr });
      for (const row of archived) {
        emitAppEvent({ type: "offer_consumed", offerId: row.id, nullifier: nullifierStr });
      }
      if (archived.length > 0) archivedEarly = true;
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
