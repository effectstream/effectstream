import {
  type MidnightEncodedStateJson,
  type Satisfies,
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

const MidnightEncodedStateJsonSchema = Type.Unsafe<
  MidnightEncodedStateJson
>(Type.String());
export const PrimitiveMidnightContractStatePayload = TypeboxHelpers
  .JsonUnsafeCast<EncodedStateValue, typeof MidnightEncodedStateJsonSchema>(
    MidnightEncodedStateJsonSchema,
  );
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
