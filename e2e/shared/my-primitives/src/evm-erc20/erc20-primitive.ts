import type { StaticDecode } from "@sinclair/typebox";
import {
  ConfigPrimitiveAccountingPayloadType,
  getEvmEvent,
} from "@paima/config";
import {
  type EvmAddress,
  type PaimaBlockNumber,
  TypeboxHelpers,
} from "@paima/utils";
import { ERC20_VIEW_PREFIX, erc20Ivm } from "./erc20-ivm.ts";
/**
 * Erc20 Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for ERC20.
 */
import { erc20 } from "./erc20-abi.ts";
import { JsonObject, PaimaPrimitive } from "../PaimaPrimitive.ts";
import { Value } from "@sinclair/typebox/value";
import { ERC20_INTERMEDIATE_PREFIX } from "./erc20-ivm.ts";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@paima/concise";
import { erc20Grammar } from "./erc20-grammar.ts";
import type { StateUpdateStream } from "@paima/coroutine";

export class Erc20Primitive extends PaimaPrimitive<typeof erc20Grammar> {
  // Primitive defined
  readonly internalName = "EVM:ERC20" as const;
  readonly internalType = "evm-rpc-erc20" as any; // ConfigPrimitiveType.EvmRpcERC20 as const;
  readonly internalEvent =
    ConfigPrimitiveAccountingPayloadType.Transfer as const;
  readonly abi = getEvmEvent(erc20.abi, "Transfer(address,address,uint256)");
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
      config.stateMachinePrefix
    );
  }

  override *getPayload(
    _: PaimaBlockNumber,
    primitiveTransactionData: any
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      stateMachinePayload: StaticDecode<
        CommandTuple<string, typeof erc20Grammar>
      > | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { to, from } = primitiveTransactionData.output.payload;
    const toAddr = Value.Decode(TypeboxHelpers.Evm.Address, to.toLowerCase());
    const fromAddr = Value.Decode(
      TypeboxHelpers.Evm.Address,
      from.toLowerCase()
    );
    // const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));
    const value = Value.Decode(
      TypeboxHelpers.Uint256,
      primitiveTransactionData.output.payload.value
    );
    const isBatched = false;
    const accountingPayload: ParamToData<typeof erc20Grammar> = {
      to: toAddr,
      from: fromAddr,
      value: value,
    };
    const stateMachinePayload: StaticDecode<
      CommandTuple<string, typeof this.grammar>
    > | null = this.stateMachinePrefix
      ? generateRawStmInput(
          this.grammar,
          this.stateMachinePrefix,
          accountingPayload
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

  override getConfig() {
    return {
      name: this.instanceName,
      type: this.internalType,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
      // TODO This should be optional.
      scheduledPrefix: this.stateMachinePrefix ?? "",
    } as const;
  }
}
