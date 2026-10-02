// The bridge state machine: owns `bridge_transfers`.
//
// Idempotent by (direction, source_id): every op is an upsert that never moves
// a row backwards (completed stays completed), so replaying any input — a
// node restart, or a wiped database re-synced from the deployment start
// heights — converges to the same rows. Completion is decided here only, from
// what sync sees on chain; the relayer never writes this table.
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  upsertLockObserved,
  upsertMintCompleted,
  upsertReleaseCompleted,
  upsertWithdrawalObserved,
} from "@solana-midnight-bridge/database";
import { grammar, MIDNIGHT_STATE_PREFIX, SOLANA_LOG_PREFIX } from "./grammar.ts";
import { planMidnightSnapshot, planSolanaLogs, type StfOp } from "./stf-logic.ts";

export type BridgeStateMachineOptions = {
  /** The bridge program id (base58) of this deployment. */
  programId: string;
  /** The SPL mint (base58) the program custodies; LOCKs of other mints are ignored. */
  mint?: string;
  /** The same mint as 32-byte hex, as the Midnight contract seals it. */
  sourceMintHex?: string;
};

/** Applies one op. Exported for the unit tests' generator driver. */
export function* applyOp(op: StfOp, blockHeight: number): SyncStateUpdateStream<void> {
  switch (op.kind) {
    case "lock-observed":
      yield* World.resolve(upsertLockObserved, {
        source_id: op.nonce.toString(),
        amount: op.amount.toString(),
        recipient: op.recipientHex,
        sender: op.depositor,
        src_ref: `solana-slot:${op.slot}`,
        block_height: blockHeight,
      });
      return;
    case "release-completed":
      yield* World.resolve(upsertReleaseCompleted, {
        source_id: op.withdrawalId.toString(),
        amount: op.amount.toString(),
        recipient: op.recipientOwner,
        dst_ref: `solana-slot:${op.slot}`,
        block_height: blockHeight,
      });
      return;
    case "mint-completed":
      yield* World.resolve(upsertMintCompleted, {
        source_id: op.nonce.toString(),
        amount: op.amount.toString(),
        dst_ref: `midnight-block:${blockHeight}`,
        block_height: blockHeight,
      });
      return;
    case "withdrawal-observed":
      yield* World.resolve(upsertWithdrawalObserved, {
        source_id: op.withdrawalId.toString(),
        amount: op.amount.toString(),
        recipient: op.solanaRecipient,
        src_ref: `midnight-block:${blockHeight}`,
        block_height: blockHeight,
      });
      return;
  }
}

export function createBridgeStateMachine(opts: BridgeStateMachineOptions): {
  stm: Stm<typeof grammar, {}>;
  gameStateTransitions: StartConfigGameStateTransitions;
} {
  const stm = new Stm<typeof grammar, {}>(grammar);

  stm.addStateTransition(SOLANA_LOG_PREFIX, function* (data) {
    const ops = planSolanaLogs(data.parsedInput, { programId: opts.programId, expectedMint: opts.mint });
    for (const op of ops) yield* applyOp(op, data.blockHeight);
  });

  stm.addStateTransition(MIDNIGHT_STATE_PREFIX, function* (data) {
    const { ops, rejected } = planMidnightSnapshot((data.parsedInput as { payload: unknown }).payload, {
      expectedSourceMint: opts.sourceMintHex,
    });
    if (rejected.length > 0) {
      console.warn(`[bridge-stf] block ${data.blockHeight}: skipped ${rejected.length} malformed snapshot entr(ies): ${rejected.join(", ")}`);
    }
    for (const op of ops) yield* applyOp(op, data.blockHeight);
  });

  const gameStateTransitions: StartConfigGameStateTransitions = function* (
    _blockHeight: number,
    input: BaseStfInput,
  ): SyncStateUpdateStream<void> {
    yield* stm.processInput(input);
  };
  return { stm, gameStateTransitions };
}
