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
import { StaticDecode, type TSchema, Type } from "@sinclair/typebox";
import { PaimaPrimitive } from "../PaimaPrimitive.ts";
import { PaimaPrimitiveRegistry } from "../PrimitiveRegistry.ts";
import { Value } from "@sinclair/typebox/value";
import { ERC721_INTERMEDIATE_PREFIX } from "./erc721-ivm.ts";
import { CommandTuple, generateRawStmInput } from "@paima/concise";

export class Erc721Primitive extends PaimaPrimitive {
  // Instance defined
  override instanceName: string;
  override startBlockHeight: number;
  override contractAddress: EvmAddress;
  abi: ReturnType<typeof getEvmEvent>;
  // TODO This should be optional.
  override stateMachinePrefix: string; // | undefined;

  // Primitive defined
  readonly internalName = "EVM:ERC721" as const;
  readonly internalType = ConfigPrimitiveType.EvmRpcERC721 as const;
  readonly internalEvent = ConfigPrimitiveAccountingPayloadType
    .Transfer as const;
  override grammar: readonly Readonly<[string, TSchema]>[] = [
    [
      // TODO This should be the user defined prefix
      "payload",
      // TODO This does not need to be an object, but we copied it for now.
      Type.Object({
        to: Type.String(),
        from: Type.String(),
        tokenId: Type.String(),
        // This is not part of the standard, we inject this value by comparing the to address.
        isBurn: Type.Boolean(),
      }),
    ],
  ] as const;
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
    super();
    this.abi = getEvmEvent(erc721.abi, "Transfer(address,address,uint256)");
    this.instanceName = config.instanceName;
    this.startBlockHeight = config.startBlockHeight;
    this.contractAddress = Value.Decode(
      TypeboxHelpers.Evm.Address,
      config.contractAddress,
    );
    // TODO This should be optional.
    this.stateMachinePrefix = config.stateMachinePrefix || "";
    PaimaPrimitiveRegistry.addPrimitive(this);
  }

  // TODO Prefix can be a class member.
  override getStateMachinePayload(primitiveTransactionData: any): StaticDecode<
    CommandTuple<
      typeof this.stateMachinePrefix,
      typeof this.grammar
    >
  > {
    const payload = this.getPayload(primitiveTransactionData);

    return generateRawStmInput(
      this.grammar,
      this.stateMachinePrefix,
      payload,
    );
  }

  // TODO This type must match the grammar.
  override getPayload(primitiveTransactionData: any): Record<string, any> {
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
      payload: Value.Decode(
        this.grammar[0][1],
        {
          to: toAddr,
          from: fromAddr,
          tokenId: tokenId,
          isBurn: isBurn,
        },
      ),
    };
  }

  override getConfig() {
    return {
      name: this.instanceName,
      type: this.internalType,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress,
      abi: this.abi,
      scheduledPrefix: this.stateMachinePrefix,
    } as const;
  }
}
