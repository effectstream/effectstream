import type { StaticDecode } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type ProtocolPrimitiveMap,
} from "@effectstream/config";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
} from "@effectstream/utils";
import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { nearGenericGrammar } from "./near-generic-grammar.ts";
import { PrimitiveTypeNEARGeneric } from "../builtin.ts";

export class NearGenericPrimitive extends Primitive<
  ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
  typeof nearGenericGrammar
> {
  readonly internalTypeName = PrimitiveTypeNEARGeneric;
  override grammar = nearGenericGrammar;
  readonly contractId: string;
  readonly eventStandard: string;
  readonly eventType: string;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractId: string;
    eventStandard: string;
    eventType: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.contractId = config.contractId;
    this.eventStandard = config.eventStandard;
    this.eventType = config.eventType;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.NEAR_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<CommandTuple<string, typeof nearGenericGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;

    const accountingPayload: ParamToData<typeof nearGenericGrammar> = {
      payload,
    };

    const stateMachinePayload = this.stateMachinePrefix
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
            type: AddressType.NEAR,
            address: String(
              primitiveTransactionData.syncProtocol.contractAddress ?? "",
            ),
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.NEAR_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractId: this.contractId,
      eventStandard: this.eventStandard,
      eventType: this.eventType,
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
