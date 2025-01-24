import { type Satisfies, TypeboxHelpers } from "@paima/utils";
import {
  ConfigPrimitiveType,
  type MinaPrimitivesToSyncProtocol,
} from "../config/types.ts";
import { type Static, Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "./types.ts";

// =========
// Event log
// =========

// TODO: what is the format of this?
export const PrimitiveMinaEventPayload = Type.Array(
  Type.Array(TypeboxHelpers.UnknownFormat),
);

export const PrimitiveMinaEventSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.MinaEventGeneric),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveMinaEventPayload,
});

// ==========
// Action log
// ==========

// TODO: what is the format of this?
export const PrimitiveMinaActionPayload = Type.Array(
  Type.Array(TypeboxHelpers.UnknownFormat),
);

export const PrimitiveMinaActionSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.MinaActionGeneric),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveMinaActionPayload,
});

// ===
// All
// ===

export const syncProtocolResponsesMina = [
  PrimitiveMinaEventSyncProtocolResponse,
  PrimitiveMinaActionSyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesMina)[number]>["primitive"]],
  [keyof typeof MinaPrimitivesToSyncProtocol]
>;
