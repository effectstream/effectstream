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
import { nep245Grammar } from "./nep245-grammar.ts";
import {
  NEP245_INTERMEDIATE_PREFIX,
  NEP245_VIEW_PREFIX,
  nep245Ivm,
} from "./nep245-ivm.ts";
import { PrimitiveTypeNEARNEP245 } from "../builtin.ts";

const ZERO_ACCOUNT = "";

export class Nep245Primitive extends Primitive<
  ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
  typeof nep245Grammar
> {
  readonly internalTypeName = PrimitiveTypeNEARNEP245;
  override grammar = nep245Grammar;
  readonly contractId: string;

  override dynamicTables = nep245Ivm;
  override getIntermediatePrefix(): string[] {
    return [NEP245_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [NEP245_VIEW_PREFIX];
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
        | StaticDecode<CommandTuple<string, typeof nep245Grammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload as Record<string, unknown>;
    const eventType = String(payload._event ?? "mt_transfer");
    const oldOwnerId = String(payload.old_owner_id ?? "");
    const newOwnerId = String(payload.new_owner_id ?? "");

    // NEP-245 events have parallel token_ids[] and amounts[]
    const tokenIds: string[] = Array.isArray(payload.token_ids)
      ? (payload.token_ids as string[])
      : [String(payload.token_ids ?? payload.token_id ?? "")];
    const amounts: string[] = Array.isArray(payload.amounts)
      ? (payload.amounts as string[])
      : [String(payload.amounts ?? payload.amount ?? "0")];

    const isMint = oldOwnerId === ZERO_ACCOUNT || eventType === "mt_mint";
    const isBurn = newOwnerId === ZERO_ACCOUNT || eventType === "mt_burn";

    const result: {
      isBatched: boolean;
      data: {
        fromAddressAndType: AddressAndType;
        stateMachinePayload:
          | StaticDecode<CommandTuple<string, typeof nep245Grammar>>
          | null;
        accountingPayload: JsonObject;
      }[];
    } = {
      isBatched: tokenIds.length > 1,
      data: [],
    };

    for (let i = 0; i < tokenIds.length; i++) {
      const accountingPayload: ParamToData<typeof nep245Grammar> = {
        type: eventType,
        old_owner_id: oldOwnerId,
        new_owner_id: newOwnerId,
        token_id: tokenIds[i],
        amount: amounts[i] ?? "0",
        isMint,
        isBurn,
      };

      const stateMachinePayload: StaticDecode<
        CommandTuple<string, typeof nep245Grammar>
      > | null = this.stateMachinePrefix
        ? generateRawStmInput(
          this.grammar,
          this.stateMachinePrefix,
          accountingPayload,
        )
        : null;

      result.data.push({
        fromAddressAndType: {
          type: AddressType.NEAR,
          address: oldOwnerId || newOwnerId,
        },
        accountingPayload,
        stateMachinePayload,
      });
    }

    return result;
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.NEAR_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractId: this.contractId,
      eventStandard: "nep245",
      eventType: "mt_transfer",
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
