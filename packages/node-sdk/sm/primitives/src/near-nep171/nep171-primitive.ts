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
import { nep171Grammar } from "./nep171-grammar.ts";
import {
  NEP171_INTERMEDIATE_PREFIX,
  NEP171_VIEW_PREFIX,
  nep171Ivm,
} from "./nep171-ivm.ts";
import { PrimitiveTypeNEARNEP171 } from "../builtin.ts";

const BURN_RECEIVER = "system";

export class Nep171Primitive extends Primitive<
  ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
  typeof nep171Grammar
> {
  readonly internalTypeName = PrimitiveTypeNEARNEP171;
  override grammar = nep171Grammar;
  readonly contractId: string;

  override dynamicTables = nep171Ivm;
  override getIntermediatePrefix(): string[] {
    return [NEP171_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [NEP171_VIEW_PREFIX];
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
        | StaticDecode<CommandTuple<string, typeof nep171Grammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload as Record<string, unknown>;
    const oldOwnerId = String(payload.old_owner_id ?? "");
    const newOwnerId = String(payload.new_owner_id ?? "");
    // NEP-171 events may have token_ids array — emit one per token
    const tokenIds: string[] = Array.isArray(payload.token_ids)
      ? (payload.token_ids as string[])
      : [String(payload.token_ids ?? payload.token_id ?? "")];

    const isBurn = newOwnerId === "" || newOwnerId === BURN_RECEIVER;

    const result: {
      isBatched: boolean;
      data: {
        fromAddressAndType: AddressAndType;
        stateMachinePayload:
          | StaticDecode<CommandTuple<string, typeof nep171Grammar>>
          | null;
        accountingPayload: JsonObject;
      }[];
    } = {
      isBatched: tokenIds.length > 1,
      data: [],
    };

    for (const tokenId of tokenIds) {
      const accountingPayload: ParamToData<typeof nep171Grammar> = {
        old_owner_id: oldOwnerId,
        new_owner_id: newOwnerId,
        token_id: tokenId,
        isBurn,
      };

      const stateMachinePayload: StaticDecode<
        CommandTuple<string, typeof nep171Grammar>
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
          address: oldOwnerId,
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
      eventStandard: "nep171",
      eventType: "nft_transfer",
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
