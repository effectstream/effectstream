import { Value } from "@sinclair/typebox/value";
import { type StaticDecode, Type } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolType,
  getEvmEvent,
  type ProtocolPrimitiveMap,
} from "@paima/config";
import {
  type EvmAddress,
  type PaimaBlockNumber,
  TypeboxHelpers,
} from "@paima/utils";
import { type JsonObject, PaimaPrimitive } from "@paima/sm";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@paima/concise";
import type { StateUpdateStream } from "@paima/coroutine";
import { ERC721_VIEW_PREFIX, erc721Ivm } from "./erc721-ivm.ts";
import { ERC721_INTERMEDIATE_PREFIX } from "./erc721-ivm.ts";
import { erc721 } from "./erc721-abi.ts";

/**
 * Erc721 Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for ERC721.
 */
export const erc721Grammar = [
  ["to", Type.String()],
  ["from", Type.String()],
  ["tokenId", Type.String()],
  ["isBurn", Type.Boolean()],
] as const;

export const ERC721_TYPE = "EVM:ERC721" as const;

export class Erc721Primitive extends PaimaPrimitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof erc721Grammar
> {
  // Primitive defined
  readonly internalTypeName = ERC721_TYPE;
  readonly abi = getEvmEvent(erc721.abi, "Transfer(address,address,uint256)");
  override grammar = erc721Grammar;

  // Dynamic table to track the owner of each token.
  override dynamicTables = erc721Ivm;
  override getIntermediatePrefix(): string[] {
    return [ERC721_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [ERC721_VIEW_PREFIX];
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
    primitiveTransactionData: any,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof erc721Grammar>
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
    const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));
    const tokenId = Value.Decode(
      TypeboxHelpers.Uint256,
      primitiveTransactionData.output.payload.tokenId,
    );

    const isBatched = false;
    const accountingPayload: ParamToData<typeof erc721Grammar> = {
      to: toAddr,
      from: fromAddr,
      tokenId: tokenId,
      isBurn: isBurn,
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
      // TODO This should be optional.
      scheduledPrefix: this.stateMachinePrefix ?? "",
    } as const;
  }
}
