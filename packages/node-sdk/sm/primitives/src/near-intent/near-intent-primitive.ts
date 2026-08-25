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
import { nearIntentGrammar } from "./near-intent-grammar.ts";
import {
  NEAR_INTENT_INTERMEDIATE_PREFIX,
  NEAR_INTENT_VIEW_PREFIX,
  nearIntentIvm,
} from "./near-intent-ivm.ts";
import { PrimitiveTypeNEARIntent } from "../builtin.ts";
import { matchesGlob } from "./near-intent-token-id-parser.ts";

export class NearIntentPrimitive extends Primitive<
  ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
  typeof nearIntentGrammar
> {
  readonly internalTypeName = PrimitiveTypeNEARIntent;
  override grammar = nearIntentGrammar;
  readonly contractId: string;
  readonly filterTokenIds: string[];
  readonly filterAccountIds: string[];

  override dynamicTables = nearIntentIvm;
  override getIntermediatePrefix(): string[] {
    return [NEAR_INTENT_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [NEAR_INTENT_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractId: string;
    stateMachinePrefix: string | undefined;
    filterTokenIds?: string[];
    filterAccountIds?: string[];
  }) {
    super(config);
    this.contractId = config.contractId;
    this.filterTokenIds = config.filterTokenIds ?? [];
    this.filterAccountIds = config.filterAccountIds ?? [];
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
        | StaticDecode<CommandTuple<string, typeof nearIntentGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload as Record<string, unknown>;
    const accountId = String(payload.account_id ?? "");
    const intentHash = String(payload.intent_hash ?? "");

    // Apply account filter
    if (
      this.filterAccountIds.length > 0 &&
      !this.filterAccountIds.some((p) => matchesGlob(p, accountId))
    ) {
      return { isBatched: false, data: [] };
    }

    // Parse DIP-4 diff object into token_diffs array
    const diff = (payload.diff ?? {}) as Record<string, string>;
    const tokenDiffs: { token_id: string; amount: string }[] = [];
    for (const [tokenId, amount] of Object.entries(diff)) {
      // Apply token filter
      if (
        this.filterTokenIds.length > 0 &&
        !this.filterTokenIds.some((p) => matchesGlob(p, tokenId))
      ) {
        continue;
      }
      tokenDiffs.push({ token_id: tokenId, amount: String(amount) });
    }

    if (tokenDiffs.length === 0) {
      return { isBatched: false, data: [] };
    }

    const accountingPayload: ParamToData<typeof nearIntentGrammar> = {
      account_id: accountId,
      intent_hash: intentHash,
      token_diffs: tokenDiffs,
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
            address: accountId,
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
      eventStandard: "dip4",
      eventType: "token_diff",
      filterTokenIds: this.filterTokenIds,
      filterAccountIds: this.filterAccountIds,
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
