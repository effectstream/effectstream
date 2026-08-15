import { Primitive } from "../../Primitive.ts";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
} from "@effectstream/utils";
import type { StaticDecode } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { PrimitiveTypeMidnightNullifierAndCommitment } from "../builtin.ts";
import { midnightNullifierAndCommitmentGrammar } from "./midnight-nullifier-and-commitment-grammar.ts";

/** Which zswap ledger event kinds the primitive emits. */
export type MidnightZswapCapture = "nullifiers" | "commitments" | "both";

/**
 * MidnightNullifierAndCommitmentPrimitive
 *
 * Watches ZswapInput (nullifier-spend) and ZswapOutput (commitment-create)
 * events on the Midnight shielded ledger.  Both event kinds arrive in the
 * same indexer field (`zswapLedgerEvents`), so tracking both costs no extra
 * indexer queries.  One state-machine input is emitted per event observed in
 * a block, regardless of which contract produced it.  The `capture` option
 * selects which kinds are emitted (default: both).
 *
 * Usage:
 *   stm.addStateTransition("myPrefix", function* (data) {
 *     const { payload } = data.parsedInput;
 *     if (payload.kind === "nullifier") {
 *       // { kind, nullifier, txHash, eventId, logicalSegment, contract? }
 *     } else {
 *       // { kind, commitment, mtIndex, txHash, eventId, logicalSegment, contract? }
 *     }
 *   });
 */
export class MidnightNullifierAndCommitmentPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightNullifierAndCommitmentGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightNullifierAndCommitment;
  override readonly grammar = midnightNullifierAndCommitmentGrammar;

  readonly capture: MidnightZswapCapture;

  override dynamicTables = undefined;
  override getIntermediatePrefix(): string[] {
    return [];
  }
  override getViewPrefix(): string[] {
    return [];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string;
    /** Which zswap event kinds to emit. Default: "both". */
    capture?: MidnightZswapCapture;
  }) {
    super(config);
    this.capture = config.capture ?? "both";
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.MIDNIGHT_PARALLEL
    >,
  ): SyncStateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof midnightNullifierAndCommitmentGrammar>
        >
        | null;
      accountingPayload: ParamToData<
        typeof midnightNullifierAndCommitmentGrammar
      >;
    }[];
  }> {
    // The sync-protocol payload map types Midnight payloads as Record<string, any>;
    // the fetcher's fetchZswapEvents builds exactly the grammar's payload shape.
    const payload = primitiveTransactionData.output
      .payload as ParamToData<typeof this.grammar>["payload"];

    const accountingPayload: ParamToData<typeof this.grammar> = {
      payload,
    };

    const stateMachinePayload:
      | StaticDecode<CommandTuple<string, typeof this.grammar>>
      | null = this.stateMachinePrefix
      ? generateRawStmInput(
        this.grammar,
        this.stateMachinePrefix,
        accountingPayload,
      )
      : null;

    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.NONE,
            address: "0x0",
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix ?? "",
      capture: this.capture,
    } as const;
  }
}
