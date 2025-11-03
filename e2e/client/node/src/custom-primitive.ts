import { type StaticDecode, Type } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  getEvmEvent,
  type ProtocolPrimitiveMap,
} from "@effectstream/config";
import {
  type AddressAndType,
  AddressType,
  type EvmAddress,
  type PaimaBlockNumber,
  TypeboxHelpers,
} from "@effectstream/utils";
import { type JsonObject, PaimaPrimitive } from "@effectstream/sm";
import { Value } from "@sinclair/typebox/value";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { counter } from "./custom-primitive.abi.ts";

const counterGrammar = [
  ["counter", Type.Number()],
] as const;

/**
 * Erc20 Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for ERC20.
 */

export class EvmCounterPrimitive extends PaimaPrimitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof counterGrammar
> {
  // Primitive defined
  readonly internalTypeName = "EVM:CUSTOM-COUNTER";
  readonly abi: ReturnType<typeof getEvmEvent> = getEvmEvent(
    counter.abi,
    "changedCount(address,int256)",
  );
  override grammar = counterGrammar;
  readonly contractAddress: EvmAddress;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    stateMachinePrefix: string | undefined;
  }) {
    console.error("EvmCounterPrimitive constructor", config);
    super(config);
    this.contractAddress = Value.Decode(
      TypeboxHelpers.Evm.Address,
      config.contractAddress,
    );
  }

  override *getPayload(
    _: PaimaBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof counterGrammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { userAddress, count } = primitiveTransactionData.output.payload;
    const userAddressParsed = Value.Decode(
      TypeboxHelpers.Evm.Address,
      userAddress.toLowerCase(),
    );
    // Convert BigInt to number for int256 values (works for positive and negative integers)
    const countParsed = BigInt(count);
    const counterNumber = countParsed >= 0n
      ? Number(countParsed)
      : -Number(-countParsed);

    const isBatched = false;
    const accountingPayload: ParamToData<typeof counterGrammar> = {
      counter: counterNumber,
    };
    const stateMachinePayload:
      | StaticDecode<
        CommandTuple<string, typeof this.grammar>
      >
      | null = this.stateMachinePrefix
        ? generateRawStmInput(
          this.grammar,
          this.stateMachinePrefix,
          accountingPayload,
        )
        : null;

    return {
      isBatched,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.EVM,
            address: userAddressParsed,
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.EVM_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
      scheduledPrefix: this.stateMachinePrefix,
    } as const;
  }

  override getIntermediatePrefix(): string[] {
    return [];
  }

  override getViewPrefix(): string[] {
    return [];
  }

  override getDynamicTables = (name: string): string | undefined => {
    return undefined;
  };
}
