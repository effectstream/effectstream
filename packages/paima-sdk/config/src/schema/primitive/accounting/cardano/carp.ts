import { Type } from "@sinclair/typebox";
import {
  PrimitiveCardanoCarpAssetUtxoPayload,
  PrimitiveCardanoCarpDelegationPayload,
  PrimitiveCardanoCarpMintBurnPayload,
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
