import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../../config/types.ts";
import { ConfigPrimitiveAccountingPayloadType } from "../types.ts";
import {
  PrimitiveMidnightContractStatePayload,
} from "../../output/midnight/graphql.ts";

export const PrimitiveMidnightGraphqlContractStateAccounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.MidnightContractState),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Event),
  payload: PrimitiveMidnightContractStatePayload,
});
