import type { PreparedQuery } from "@pgtyped/runtime";
import type {
  AddressType,
  EffectstreamBlockNumber,
  TimestampMs,
  WalletAddress,
} from "@effectstream/utils";
import type { Prando } from "@effectstream/crypto";
import type { EventPathAndDef, ResolvedPath } from "@effectstream/event-client";
import type { Static } from "@sinclair/typebox";

/**
 * Closure passed to every state transition for emitting custom app events.
 *
 * - The runtime collects events into a per-input buffer during STF execution.
 * - On STF success, events are promoted to the per-block buffer.
 * - After the block's `COMMIT` succeeds, events are flushed to MQTT.
 * - On STF failure or block-level `ROLLBACK`, events are dropped.
 *
 * `blockHeight` is auto-injected by `registerEvents` and auto-filled by the
 * runtime — apps omit it from the payload.
 *
 * See plan: /Users/edwardalvarado/.claude/plans/wild-kindling-reddy.md
 */
export type EmitFn = <E extends EventPathAndDef>(
  event: E,
  payload: Omit<Static<E["type"]> & ResolvedPath<E["path"]>, "blockHeight">,
) => void;

export type BaseStfInput = {
  blockHeight: EffectstreamBlockNumber;
  blockTimestamp: TimestampMs;
  conciseInput: string;
  accountId?: number;
  signerAddress?: WalletAddress;
  signerAddressType?: AddressType;
  randomGenerator: Prando;
  /** Emit a custom app event. Delivered to MQTT after the block commits. */
  emit: EmitFn;
};

// Retained for compatibility with the existing `Stm<Grammar, Events>` generic
// parameter. Future work: thread a real registered-events union through here so
// `data.emit` is restricted to the app's declared events.
export type AppEvents = any;

export type BaseStfOutput<Events extends AppEvents> = {
  stateTransitions: [PreparedQuery<any, any>, any][];
  events: Events[];
};
