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
import { PrimitiveTypeMidnightUnshieldedCreate } from "../builtin.ts";
import { midnightUnshieldedCreateGrammar } from "./midnight-unshielded-create-grammar.ts";

/**
 * MidnightUnshieldedCreatePrimitive
 *
 * Watches all unshielded UTXO *creation* events on the Midnight ledger — the
 * mirror of MidnightUnshieldedSpendPrimitive. The indexer's GraphQL
 * `transactions.unshieldedCreatedOutputs` field reports the
 * `(owner, intentHash, outputIndex)` triple for each unshielded UTXO created
 * in a block (by regular AND system transactions — rewards/bridge mint
 * unshielded UTXOs). One state-machine input is emitted per created output.
 *
 * Lets a node maintain a persistent set of UTXOs that have actually been
 * created on chain, so an offer referencing a never-created unshielded UTXO
 * can be rejected (existence check).
 *
 * Usage:
 *   stm.addStateTransition("myPrefix", function* (data) {
 *     const { payload } = data.parsedInput;
 *     // payload = { owner, intentHash, outputIndex, txHash }
 *   });
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
