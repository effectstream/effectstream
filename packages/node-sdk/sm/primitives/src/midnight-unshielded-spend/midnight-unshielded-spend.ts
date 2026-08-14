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
import { PrimitiveTypeMidnightUnshieldedSpend } from "../builtin.ts";
import { midnightUnshieldedSpendGrammar } from "./midnight-unshielded-spend-grammar.ts";

/**
 * MidnightUnshieldedSpendPrimitive
 *
 * Watches all unshielded UTXO spend events on the Midnight ledger. The
 * indexer's GraphQL `transactions.unshieldedSpentOutputs` field reports the
 * `(owner, intentHash, outputIndex)` triple for each unshielded UTXO
 * consumed in a block. One state-machine input is emitted per spend.
 *
 * Usage:
 *   stm.addStateTransition("myPrefix", function* (data) {
 *     const { payload } = data.parsedInput;
 *     // payload = { owner, intentHash, outputIndex, txHash }
 *   });
 */
export class MidnightUnshieldedSpendPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightUnshieldedSpendGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightUnshieldedSpend;
  override readonly grammar = midnightUnshieldedSpendGrammar;

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
        | StaticDecode<CommandTuple<string, typeof midnightUnshieldedSpendGrammar>>
        | null;
      accountingPayload: ParamToData<typeof midnightUnshieldedSpendGrammar>;
    }[];
  }> {
    // The sync-protocol payload map types Midnight payloads as Record<string, any>;
    // the fetcher's fetchUnshieldedSpends builds exactly the grammar's payload shape.
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
