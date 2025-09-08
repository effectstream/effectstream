import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "./types.ts";
import { NameField, StartStopBlockheight } from "../../common.ts";
import { TypeboxHelpers } from "@paima/utils";

export const PrimitiveConfigBaseAvail = NameField.cloneMerge(
  StartStopBlockheight,
);

// ========
// Paima L2
// ========

export const PrimitiveAvailPaimaL2Config = PrimitiveConfigBaseAvail.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.AvailPaimaL2),
    contractAddress: TypeboxHelpers.Avail.Address,
    appId: Type.Number(),
    genesisHash: Type.String(),
  }),
  optional: Type.Object({}),
});
