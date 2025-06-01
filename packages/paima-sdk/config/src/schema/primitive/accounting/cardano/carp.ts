import { Type } from "@sinclair/typebox";
import {
  PrimitiveCardanoCarpAssetUtxoPayload,
  PrimitiveCardanoCarpDelegationPayload,
  PrimitiveCardanoCarpMintBurnPayload,
  PrimitiveCardanoCarpProjectedNFTPayload,
  PrimitiveCardanoCarpTransferPayload,
} from "../../output/cardano/carp.ts";
import { ConfigPrimitiveType } from "../../config/types.ts";
import { ConfigPrimitiveAccountingPayloadType } from "../types.ts";

export const PrimitiveCardanoCarpAssetUtxoAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpDelayedAsset),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Transfer),
  payload: PrimitiveCardanoCarpAssetUtxoPayload,
});

export const PrimitiveCardanoCarpDelegationAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpDelegation),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Transfer),
  payload: PrimitiveCardanoCarpDelegationPayload,
});

export const PrimitiveCardanoCarpMintOrBurnAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpMintBurn),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.MintOrBurn),
  payload: PrimitiveCardanoCarpMintBurnPayload,
});

export const PrimitiveCardanoCarpProjectedNFTAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpProjectedNFT),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.ProjectedNft),
  payload: PrimitiveCardanoCarpProjectedNFTPayload,
});

export const PrimitiveCardanoCarpTransferAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpTransfer),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Transfer),
  payload: PrimitiveCardanoCarpTransferPayload,
});
