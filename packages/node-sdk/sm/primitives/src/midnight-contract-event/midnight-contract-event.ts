import { Primitive } from "@effectstream/sm";
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
  MidnightContractEventType,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { PrimitiveTypeMidnightContractEvent } from "../builtin.ts";
import { midnightContractEventGrammar } from "./midnight-contract-event-grammar.ts";

export class MidnightContractEventPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightContractEventGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightContractEvent;
  override readonly grammar = midnightContractEventGrammar;
  readonly contractAddress: string;
  readonly eventType?: MidnightContractEventType;
  readonly eventFieldFilters?: Readonly<Record<string, string>>;

  override dynamicTables = undefined;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string | undefined;
    contractAddress: string;
    eventType?: MidnightContractEventType;
    eventFieldFilters?: Readonly<Record<string, string>>;
  }) {
    super(validateConfig(config));
    this.contractAddress = config.contractAddress.replace(/^0x/, "").toLowerCase();
    this.eventType = config.eventType;
    this.eventFieldFilters = config.eventFieldFilters;
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
        | StaticDecode<CommandTuple<string, typeof midnightContractEventGrammar>>
        | null;
      accountingPayload: ParamToData<typeof midnightContractEventGrammar>;
    }[];
  }> {
    const accountingPayload = primitiveTransactionData.output
      .payload as ParamToData<typeof this.grammar>;
    const stateMachinePayload = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, accountingPayload)
      : null;
    return {
      isBatched: false,
      data: [{
        fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
        accountingPayload,
        stateMachinePayload,
      }],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      stateMachinePrefix: this.stateMachinePrefix,
      scheduledPrefix: this.stateMachinePrefix,
      contractAddress: this.contractAddress,
      eventType: this.eventType,
      eventFieldFilters: this.eventFieldFilters,
    } as const;
  }
}

function validateConfig<T extends {
  contractAddress: string;
  eventType?: MidnightContractEventType;
  eventFieldFilters?: Readonly<Record<string, string>>;
}>(config: T): T {
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(config.contractAddress)) {
    throw new Error("Midnight:ContractEvent requires one 32-byte contractAddress");
  }
  if (Object.keys(config.eventFieldFilters ?? {}).length > 0 && !config.eventType) {
    throw new Error("Midnight contract event field filters require one concrete eventType");
  }
  return config;
}
