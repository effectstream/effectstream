import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
import type { StaticDecode } from "@sinclair/typebox";
import { type CommandTuple, generateRawStmInput } from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { StateUpdateStream } from "@effectstream/coroutine";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
} from "@effectstream/utils";
import { availGenericGrammar } from "./avail-generic-grammar.ts";
import { PrimitiveTypeAvailGeneric } from "../builtin.ts";

/**
 * Avail Generic Primitive
 *
 * This is a concrete implementation of the Primitive class for Avail and Generic Contracts.
 */
export class AvailGenericPrimitive extends Primitive<
  ConfigSyncProtocolType.AVAIL_PARALLEL,
  typeof availGenericGrammar
> {
  readonly internalTypeName = PrimitiveTypeAvailGeneric;
  override grammar = availGenericGrammar;
  readonly appId: number;
  readonly genesisHash: string;
  readonly applicationKey: string;
  override readonly stateMachinePrefix: string | undefined;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    appId: number;
    genesisHash: string;
    applicationKey: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.appId = config.appId;
    this.genesisHash = config.genesisHash;
    this.applicationKey = config.applicationKey;
    this.stateMachinePrefix = config.stateMachinePrefix;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.AVAIL_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof availGenericGrammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { payload } = primitiveTransactionData.output;
    const scheduledInputData = this.stateMachinePrefix
      ? generateRawStmInput(
        this.grammar,
        this.stateMachinePrefix,
        { payload },
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
          accountingPayload: { payload },
          stateMachinePayload: scheduledInputData,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.AVAIL_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      appId: this.appId,
      applicationKey: this.applicationKey,
      genesisHash: this.genesisHash,
    } as const;
  }
}
