import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../../config/types.ts";
import { ConfigPrimitiveAccountingPayloadType } from "../types.ts";
import {
  PrimitiveEvmRpcPaimaL2Payload,
} from "../../output/evm/rpc.ts";

export const PrimitiveEvmRpcPaimaL2Accounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcPaimaL2),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Event),
  payload: PrimitiveEvmRpcPaimaL2Payload,
});
