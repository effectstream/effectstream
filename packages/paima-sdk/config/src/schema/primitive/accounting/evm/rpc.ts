import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../../config/types.ts";
import { ConfigPrimitiveAccountingPayloadType } from "../types.ts";
import { TypeboxHelpers } from "@paima/utils";

const PrimitiveEvmRpcPaimaL2Payload = Type.Object({
  userAddress: TypeboxHelpers.Evm.Address,
  data: TypeboxHelpers.HexString0x(),
  value: TypeboxHelpers.Uint256,
});

export const PrimitiveEvmRpcPaimaL2Accounting = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcPaimaL2),
  payloadType: Type.Literal(ConfigPrimitiveAccountingPayloadType.Event),
  payload: PrimitiveEvmRpcPaimaL2Payload,
});
