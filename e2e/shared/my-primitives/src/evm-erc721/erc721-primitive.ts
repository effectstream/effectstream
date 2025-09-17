import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
  getEvmEvent,
} from "@paima/config";
import { type EvmAddress, TypeboxHelpers } from "@paima/utils";
import { ERC721_VIEW_PREFIX, erc721Ivm } from "./erc721-ivm.ts";
/**
 * Erc721 Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for ERC721.
 */
import { erc721 } from "./erc721-abi.ts";
import { type StaticDecode, type TSchema, Type } from "@sinclair/typebox";
import { PaimaPrimitive } from "../PaimaPrimitive.ts";
import { Value } from "@sinclair/typebox/value";
import { ERC721_INTERMEDIATE_PREFIX } from "./erc721-ivm.ts";
import { type CommandTuple, generateRawStmInput, type ParamToData } from "@paima/concise";

export const erc721Grammar = [
  ['to', Type.String()],
  ['from', Type.String()],
  ['tokenId', Type.String()],
  ['isBurn', Type.Boolean()],
] as const;

export class Erc721Primitive extends PaimaPrimitive<typeof erc721Grammar> {
  // Primitive defined
  readonly internalName = "EVM:ERC721" as const;
  readonly internalType = "evm-rpc-erc721" as any; // ConfigPrimitiveType.EvmRpcERC721 as const;
  readonly internalEvent = ConfigPrimitiveAccountingPayloadType
    .Transfer as const;
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
      Value.Decode(
        TypeboxHelpers.Evm.Address,
        config.contractAddress,
      ),
      config.stateMachinePrefix,
    );
  }

  override getStateMachinePayload(primitiveTransactionData: any): StaticDecode<
    CommandTuple<
      string,
      typeof erc721Grammar
    >
  > {
    if (!this.stateMachinePrefix) {
      throw new Error("State machine prefix is not set");
    }
    const payload = this.getPayload(primitiveTransactionData);

    return generateRawStmInput(
      this.grammar,
      this.stateMachinePrefix,
      payload,
    );
  }

  override getPayload(primitiveTransactionData: any): ParamToData<typeof erc721Grammar> {
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

    return {
      to: toAddr,
      from: fromAddr,
      tokenId: tokenId,
      isBurn: isBurn,
    }
  }

  override getConfig() {
    return {
      name: this.instanceName,
      type: this.internalType,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
      // TODO This should be optional.
      scheduledPrefix: this.stateMachinePrefix ?? '',
    } as const;
  }
}
