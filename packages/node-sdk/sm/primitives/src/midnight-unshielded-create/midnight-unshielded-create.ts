import { Primitive } from "@effectstream/sm";
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
import { PrimitiveTypeMidnightUnshieldedCreate } from "../builtin.ts";
import { midnightUnshieldedCreateGrammar } from "./midnight-unshielded-create-grammar.ts";

/**
 * MidnightUnshieldedCreatePrimitive
 *
 * Notifies the state machine when a transaction creates (or may create) unshielded UTXOs on the
 * Midnight ledger — one input per such transaction, carrying only `{ txHash }`.
 *
 * BREAKING (owner decision, 2026-08-09): this primitive no longer copies the created rows into its
 * payload. The rows live in the source of record (an UmbraDB chain archive); a state-transition
 * function that needs them reads on demand:
 *
 *   stm.addStateTransition("myPrefix", function* (data) {
 *     const { txHash } = data.parsedInput.payload;
 *     const outcome = yield* World.promise(umbraRead.getUnshieldedCreates(txHash));
 *     // outcome.ok -> outcome.outputs: { owner, intentHash, outputIndex, value, tokenType }[]
 *     // !outcome.ok -> outcome.refusal names why the rows cannot be derived (e.g. a ClaimRewards
 *     //                transaction, whose UTXO needs ledger-internal reconstruction) — the
 *     //                consumer decides, instead of the sync layer halting.
 *   });
 *
 * The trigger invariant is unchanged: the state machine fires exactly when data exists at a block
 * height. What moved is WHERE the data is read — from a copy in every STM input to the archive
 * itself, so exactly one copy of the data exists.
 */
export class MidnightUnshieldedCreatePrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightUnshieldedCreateGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightUnshieldedCreate;
  override readonly grammar = midnightUnshieldedCreateGrammar;

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
  }) {
    super(config);
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
        | StaticDecode<CommandTuple<string, typeof midnightUnshieldedCreateGrammar>>
        | null;
      accountingPayload: ParamToData<typeof midnightUnshieldedCreateGrammar>;
    }[];
  }> {
    // The sync-protocol payload map types Midnight payloads as Record<string, any>;
    // the fetcher's fetchUnshieldedCreates builds exactly the grammar's payload shape.
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
    } as const;
  }
}
