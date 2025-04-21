import type { Satisfies } from "@paima/utils";
import {
  type CardanoUtxorpcPrimitivesToSyncProtocol,
  ConfigPrimitiveType,
} from "../../config/types.ts";
import { type Static, Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "../types.ts";

// ==========
// Delegation
// ==========

export const PrimitiveCardanoMatchTxPayload = Type.Object({});

export const PrimitiveCardanoUtxorpcMatchTxSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoUtxorpcMatchTx),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveCardanoMatchTxPayload,
});

// ===
// All
// ===

export const syncProtocolResponsesCardanoUtxorpc = [
  PrimitiveCardanoUtxorpcMatchTxSyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesCardanoUtxorpc)[number]>["primitive"]],
  [keyof typeof CardanoUtxorpcPrimitivesToSyncProtocol]
>;
