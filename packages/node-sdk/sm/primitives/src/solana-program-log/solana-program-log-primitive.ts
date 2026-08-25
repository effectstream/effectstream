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
import { solanaProgramLogGrammar } from "./solana-program-log-grammar.ts";
import { PrimitiveTypeSolanaProgramLog } from "../builtin.ts";

export class SolanaProgramLogPrimitive extends Primitive<
  ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
  typeof solanaProgramLogGrammar
> {
  readonly internalTypeName = PrimitiveTypeSolanaProgramLog;
  override grammar = solanaProgramLogGrammar;
  readonly programId: string;
  readonly eventType: string | undefined;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    programId: string;
    eventType?: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.programId = config.programId;
    this.eventType = config.eventType;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.SOLANA_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<CommandTuple<string, typeof solanaProgramLogGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { programId, slot, logMessages } =
      primitiveTransactionData.output.payload as {
        programId: string;
        slot: number;
        logMessages: string[];
      };

    const accountingPayload: ParamToData<typeof solanaProgramLogGrammar> = {
      slot,
      programId,
      logMessages,
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
            type: AddressType.SOLANA,
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
    ConfigSyncProtocolType.SOLANA_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      programId: this.programId,
      eventType: this.eventType,
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}
