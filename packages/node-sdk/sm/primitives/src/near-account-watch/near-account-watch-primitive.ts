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
import { nearAccountWatchGrammar } from "./near-account-watch-grammar.ts";
import { PrimitiveTypeNEARAccountWatch } from "../builtin.ts";

export class NearAccountWatchPrimitive extends Primitive<
  ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
  typeof nearAccountWatchGrammar
> {
  readonly internalTypeName = PrimitiveTypeNEARAccountWatch;
  override grammar = nearAccountWatchGrammar;
  readonly contractId: string;

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
        | StaticDecode<CommandTuple<string, typeof nearAccountWatchGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload as Record<string, unknown>;
    const signerId = String(payload.signer_id ?? "");
    const receiverId = String(payload.receiver_id ?? "");
    const methodName = String(payload.method_name ?? "");
    const args = String(payload.args ?? "");
    const deposit = String(payload.deposit ?? "0");
    const status = String(payload.status ?? "unknown");

    const accountingPayload: ParamToData<typeof nearAccountWatchGrammar> = {
      signer_id: signerId,
      receiver_id: receiverId,
      method_name: methodName,
      args,
      deposit,
      status,
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
            address: signerId,
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
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
