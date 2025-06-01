import { type Satisfies, TypeboxHelpers } from "@paima/utils";
import type { Static } from "@sinclair/typebox";
import {
  type AvailPrimitivesToSyncProtocol,
  ConfigPrimitiveType,
} from "../../config/types.ts";
import { Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "../types.ts";

// ========
// Paima L2
// ========

export const PrimitiveAvailPaimaL2Payload = Type.Object({
  // recall: any address is possible because of the batcher mechanism
  realAddress: TypeboxHelpers.WalletAddress(),
  // TODO: this should be Paima concise encoding
  inputData: TypeboxHelpers.UnknownFormat,
  suppliedValue: TypeboxHelpers.Uint256,
  inputNonce: TypeboxHelpers.HexString0x(),
});

export const PrimitiveAvailPaimaL2SyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.AvailPaimaL2),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveAvailPaimaL2Payload,
});

// ===
// All
// ===

export const syncProtocolResponsesAvail = [
  PrimitiveAvailPaimaL2SyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesAvail)[number]>["primitive"]],
  [keyof typeof AvailPrimitivesToSyncProtocol]
>;
