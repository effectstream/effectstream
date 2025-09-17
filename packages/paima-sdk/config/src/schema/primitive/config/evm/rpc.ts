import { Type } from "@sinclair/typebox";
import type { StaticDecode } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../types.ts";
import { AbiField, NameField, StartStopBlockheight } from "../../../common.ts";
import { type MergeIntersects, TypeboxHelpers } from "@paima/utils";

export const PrimitiveConfigBaseEvm = NameField.cloneMerge(
  StartStopBlockheight,
).cloneMerge(AbiField);

// ========
// Paima L2
// ========

export const PrimitiveEvmPaimaL2Config = PrimitiveConfigBaseEvm.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcPaimaL2),
    contractAddress: TypeboxHelpers.Evm.Address,
  }),
  optional: Type.Object({}),
});

