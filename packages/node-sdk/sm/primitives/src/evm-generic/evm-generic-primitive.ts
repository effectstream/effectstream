import type { StaticDecode, TSchema } from "@sinclair/typebox";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  getEvmEvent,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import {
  type AddressAndType,
  AddressType,
  type EvmAddress,
  type EffectstreamBlockNumber,
  TypeboxHelpers,
} from "@effectstream/utils";
import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
import { Value } from "@sinclair/typebox/value";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { PrimitiveTypeEVMGeneric } from "../builtin.ts";

/**
 * Erc20 Primitive
 *
 * This is a concrete implementation of the Primitive class for ERC20.
 */

export class EvmGenericPrimitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  readonly [string, TSchema][]
> {
  // Primitive defined
  readonly internalTypeName = PrimitiveTypeEVMGeneric;
  readonly abi: ReturnType<typeof getEvmEvent>;
  override grammar: readonly [string, TSchema][];
  readonly contractAddress: EvmAddress;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    stateMachinePrefix: string | undefined;
    abi: ReturnType<typeof getEvmEvent>;
    grammar: readonly [string, TSchema][];
  }) {
    super(config);
    this.contractAddress = Value.Decode(
      TypeboxHelpers.Evm.Address,
      config.contractAddress,
    );
    this.abi = config.abi;
    this.grammar = config.grammar;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, any>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;
    const accountingPayload = this.clearBigInts({
      ...payload,
    });
    const stateMachinePayload: any = this.stateMachinePrefix
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
            type: AddressType.NONE,
            address: "0x0",
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  private clearBigInts<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(
        value,
        (_, v) => typeof v === "bigint" ? v.toString() : v,
      ),
    );
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
}
