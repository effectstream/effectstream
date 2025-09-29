import { type JsonObject, PaimaPrimitive } from "@paima/sm";
import { type StaticDecode, Type } from "@sinclair/typebox";
import { type CommandTuple, generateRawStmInput } from "@paima/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@paima/config";
import type { StateUpdateStream } from "@paima/coroutine";
import {
  type AddressAndType,
  AddressType,
  type PaimaBlockNumber,
} from "@paima/utils";

/**
 * Avail Generic Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for Avail and Generic Contracts.
 */
export const AVAIL_GENERIC_TYPE = "AVAIL:GENERIC" as const;

export const availGenericGrammar = [
  ["payload", Type.Object({ suppliedValue: Type.String() })],
] as const;

export class AvailGenericPrimitive extends PaimaPrimitive<
  ConfigSyncProtocolType.AVAIL_PARALLEL,
  typeof availGenericGrammar
> {
  readonly internalTypeName = AVAIL_GENERIC_TYPE;
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
    super(
      config.instanceName,
      config.startBlockHeight,
      config.stateMachinePrefix,
    );
    this.appId = config.appId;
    this.genesisHash = config.genesisHash;
    this.applicationKey = config.applicationKey;
    this.stateMachinePrefix = config.stateMachinePrefix;
  }

  override *getPayload(
    _: PaimaBlockNumber,
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
