import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../../config/types.ts";
import { ConfigPrimitiveAccountingPayloadType } from "../types.ts";
import {
  PrimitiveEvmRpcErc1155TransferPayload,
  PrimitiveEvmRpcErc20TransferPayload,
  PrimitiveEvmRpcErc6551RegistryPayload,
  PrimitiveEvmRpcErc721MintPayload,
  PrimitiveEvmRpcErc721TransferPayload,
} from "../../output/evm/rpc.ts";

export const PrimitiveEvmRpcErc20TransferAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC20),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Transfer),
  payload: PrimitiveEvmRpcErc20TransferPayload,
});

export const PrimitiveEvmRpcErc721TransferAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC721),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Transfer),
  payload: PrimitiveEvmRpcErc721TransferPayload,
});
export const PrimitiveEvmRpcErc721MintAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC721),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.MintOrBurn),
  payload: PrimitiveEvmRpcErc721MintPayload,
});
export const PrimitiveEvmRpcErc1155TransferAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC1155),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Transfer),
  payload: PrimitiveEvmRpcErc1155TransferPayload,
});
export const PrimitiveEvmRpcErc6551RegistryAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC6551Registry),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Registry),
  payload: PrimitiveEvmRpcErc6551RegistryPayload,
});
