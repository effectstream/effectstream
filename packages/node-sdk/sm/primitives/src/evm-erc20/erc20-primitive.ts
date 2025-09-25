import type { StaticDecode } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  getEvmEvent,
  type ProtocolPrimitiveMap,
} from "@paima/config";
import {
  type EvmAddress,
  type PaimaBlockNumber,
  TypeboxHelpers,
} from "@paima/utils";
import { type JsonObject, PaimaPrimitive } from "@paima/sm";
import { Value } from "@sinclair/typebox/value";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@paima/concise";
import type { StateUpdateStream } from "@paima/coroutine";
import { erc20 } from "./erc20-abi.ts";
import { erc20Grammar } from "./erc20-grammar.ts";
import {
  ERC20_INTERMEDIATE_PREFIX,
  ERC20_VIEW_PREFIX,
  erc20Ivm,
} from "./erc20-ivm.ts";

/**
 * Erc20 Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for ERC20.
 */
export const ERC20_TYPE = "EVM:ERC20" as const;

export class Erc20Primitive extends PaimaPrimitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof erc20Grammar
> {
  // Primitive defined
  readonly internalTypeName = ERC20_TYPE;
  readonly abi: ReturnType<typeof getEvmEvent> = getEvmEvent(
    erc20.abi,
    "Transfer(address,address,uint256)",
  );
  override grammar = erc20Grammar;

  // Dynamic table to track the owner of each token.
  override dynamicTables = erc20Ivm;
  override getIntermediatePrefix(): string[] {
    return [ERC20_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [ERC20_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    stateMachinePrefix: string | undefined;
  }) {
    super(
      config.instanceName,
      config.startBlockHeight,
      Value.Decode(TypeboxHelpers.Evm.Address, config.contractAddress),
      config.stateMachinePrefix,
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
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof erc20Grammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { to, from } = primitiveTransactionData.output.payload;
    const toAddr = Value.Decode(TypeboxHelpers.Evm.Address, to.toLowerCase());
    const fromAddr = Value.Decode(
      TypeboxHelpers.Evm.Address,
      from.toLowerCase(),
    );
    // const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));
    const value = Value.Decode(
      TypeboxHelpers.Uint256,
      primitiveTransactionData.output.payload.value,
    );
    const isBatched = false;
    const accountingPayload: ParamToData<typeof erc20Grammar> = {
      to: toAddr,
      from: fromAddr,
      value: value,
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
}

declare module "@paima/sm" {
  interface PrimitiveGlobalDefinitions {
    Erc20Primitive: typeof Erc20Primitive;
  }
}
