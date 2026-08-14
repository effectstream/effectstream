import type { Static, StaticDecode, TSchema } from '@sinclair/typebox';
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { ConfigSyncProtocolType, FlattenSyncProtocolIOFor, ProtocolPrimitiveMap, UtxorpcTxPredicate } from '@effectstream/config';
import type { StateUpdateStream } from "@effectstream/coroutine";
import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
import { type AddressAndType, AddressType, type EffectstreamBlockNumber, uint8ArrayToHexString } from '@effectstream/utils';
import { utxorpcGenericGrammar } from './utxorpc-generic-grammar.ts';
import { PrimitiveTypeUtxorpcGeneric } from '../builtin.ts';

export class UtxorpcGenericPrimitive extends Primitive<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  typeof utxorpcGenericGrammar
> {
  readonly internalTypeName = PrimitiveTypeUtxorpcGeneric;
  readonly predicate: UtxorpcTxPredicate;
  override grammar = utxorpcGenericGrammar;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string | undefined;
    predicate: UtxorpcTxPredicate;
  }) {
    super(config);
    this.predicate = config.predicate;
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      predicate: this.predicate,
    } as const;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof utxorpcGenericGrammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;
    const accountingPayload = {
      hash: uint8ArrayToHexString(payload.tx.hash),
      bytes: uint8ArrayToHexString(payload.tx.toBinary()),
    };
    const stateMachinePayload: any = this.stateMachinePrefix
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
}
