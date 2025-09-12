import { ConfigPrimitiveAccountingPayloadType, ConfigPrimitiveType, getEvmEvent } from "@paima/config";
import { EvmAddress, TypeboxHelpers } from "@paima/utils";
import { erc721Ivm } from "./erc721-ivm.ts";
/**
 * Erc721 Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for ERC721.
 */
import { erc721 } from "./erc721-abi.ts";
import { Type } from "@sinclair/typebox";
import { PaimaPrimitive } from "../PaimaPrimitive.ts";
import { PaimaPrimitiveRegistry } from "../PrimitiveRegistry.ts";
import { Value } from "@sinclair/typebox/value";

export class Erc721Primitive extends PaimaPrimitive {
  override instanceName: string;
  override startBlockHeight: number;
  override contractAddress: EvmAddress;
  override abi: ReturnType<typeof getEvmEvent>;

  internalName = "EVM:ERC721";
  internalType = ConfigPrimitiveType.EvmRpcERC721;
  internalEvent = ConfigPrimitiveAccountingPayloadType.Transfer; 
  // TODO This should be defined - as it must match the trigger.
  
  grammar = [
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
  ];

  dynamicTables = erc721Ivm;
  override getIntermediatePrefix(): string[] {
    return ["erc721_ownership_intermediate_"];
  }
  override getViewPrefix(): string[] {
    return ["erc721_ownership_view_"];
  }

  constructor(
    instanceName: string,
    startBlockHeight: number,
    contractAddress: EvmAddress
  ) {
    super();
    this.abi = getEvmEvent(erc721.abi, "Transfer(address,address,uint256)");
    this.instanceName = instanceName;
    this.startBlockHeight = startBlockHeight;
    this.contractAddress = Value.Decode(TypeboxHelpers.Evm.Address, contractAddress);

    PaimaPrimitiveRegistry.addPrimitive(this);
  }

  // TODO Prefix can be a class member.
  override getStateMachinePayload(prefix: string, primitiveTransactionData: any) {
    const [payload] = this.getPayload(primitiveTransactionData);

    return JSON.stringify([prefix, {
      to: payload.to,
      from: payload.from,
      tokenId: payload.tokenId,
      isBurn: payload.isBurn,
    }]);
  }
  // TODO This type must match the grammar.
  override getPayload(primitiveTransactionData: any): any[] {
    const { to, from } = primitiveTransactionData.output.payload;
    const toAddr = Value.Decode(TypeboxHelpers.Evm.Address, to.toLowerCase());
    const fromAddr = Value.Decode(TypeboxHelpers.Evm.Address, from.toLowerCase());
    const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));
    const tokenId = Value.Decode(TypeboxHelpers.Uint256, primitiveTransactionData.output.payload.tokenId);

    const payloadSchema = Type.Object({
      to: Type.String(),
      from: Type.String(),
      tokenId: Type.String(),
      isBurn: Type.Boolean(),
    });
    const payload = Value.Decode(payloadSchema, { to: toAddr, from: fromAddr, tokenId: tokenId, isBurn: isBurn });

    return [{
      to: payload.to,
      from: payload.from,
      tokenId: payload.tokenId,
      isBurn: payload.isBurn,
    }];
  }
}
