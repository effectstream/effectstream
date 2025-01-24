import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "./types.ts";
import { NameField, StartStopBlockheight } from "../../common.ts";
import { TypeboxHelpers } from "@paima/utils";

export const PrimitiveConfigBaseMidnight = NameField.cloneMerge(
  StartStopBlockheight,
);

// =======
// Generic
// =======

export const PrimitiveMidnightContractStateConfig = PrimitiveConfigBaseMidnight
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.MidnightContractState),
      contractAddress: TypeboxHelpers.Midnight.Address,
      scheduledPrefix: Type.String(),
    }),
    optional: Type.Object({}),
  });
