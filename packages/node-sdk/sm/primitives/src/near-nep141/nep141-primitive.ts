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
import { nep141Grammar } from "./nep141-grammar.ts";
import {
  NEP141_INTERMEDIATE_PREFIX,
  NEP141_VIEW_PREFIX,
  nep141Ivm,
} from "./nep141-ivm.ts";
import { PrimitiveTypeNEARNEP141 } from "../builtin.ts";

export class Nep141Primitive extends Primitive<
  ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
  typeof nep141Grammar
> {
  readonly internalTypeName = PrimitiveTypeNEARNEP141;
  override grammar = nep141Grammar;
  readonly contractId: string;

  override dynamicTables = nep141Ivm;
  override getIntermediatePrefix(): string[] {
    return [NEP141_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [NEP141_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractId: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.contractId = config.contractId;
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
        | StaticDecode<CommandTuple<string, typeof nep141Grammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload as Record<string, unknown>;
    const oldOwnerId = String(payload.old_owner_id ?? "");
    const newOwnerId = String(payload.new_owner_id ?? "");
    const amount = String(payload.amount ?? "0");

    const accountingPayload: ParamToData<typeof nep141Grammar> = {
      old_owner_id: oldOwnerId,
      new_owner_id: newOwnerId,
      amount,
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
            type: AddressType.NEAR,
            address: oldOwnerId,
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
      eventStandard: "nep141",
      eventType: "ft_transfer",
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
