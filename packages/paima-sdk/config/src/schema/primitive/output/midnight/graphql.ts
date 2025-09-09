import type {
  MidnightEncodedStateJson,
  Satisfies,
  TypeboxHelpers,
} from "@paima/utils";
import {
  ConfigPrimitiveType,
  type MidnightPrimitivesToSyncProtocol,
} from "../../config/types.ts";
import { type Static, Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "../types.ts";
import type { EncodedStateValue } from "@midnight-ntwrk/onchain-runtime";

// ==============
// Contract state
// ==============

// Define a proper TypeBox schema for EncodedStateValue
const EncodedStateValueSchema = Type.Recursive((Self) =>
  Type.Union([
    Type.Object({
      tag: Type.Literal("null"),
    }),
    Type.Object({
      tag: Type.Literal("cell"),
      content: Self, // Recursive reference for nested structures
    }),
    Type.Object({
      tag: Type.Literal("array"),
      content: Type.Array(Self),
    }),
    Type.Object({
      tag: Type.Literal("map"),
      content: Type.Any(), // Maps are complex, use Any for now
    }),
    Type.Object({
      tag: Type.Literal("some"),
      value: Self,
    }),
    Type.Object({
      tag: Type.Literal("none"),
    }),
  ])
);

export const PrimitiveMidnightContractStatePayload = Type.Unsafe<
  EncodedStateValue
>(EncodedStateValueSchema);
export const PrimitiveMidnightContractStateSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.MidnightContractState),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveMidnightContractStatePayload,
});

// ===
// All
// ===

export const syncProtocolResponsesMidnight = [
  PrimitiveMidnightContractStateSyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesMidnight)[number]>["primitive"]],
  [keyof typeof MidnightPrimitivesToSyncProtocol]
>;
