import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "./types.ts";
import { NameField, StartStopBlockheight } from "../../common.ts";
import { TypeboxHelpers } from "@paima/utils";

export const PrimitiveConfigBaseMina = NameField.cloneMerge(
  StartStopBlockheight,
);

// =======
// Generic
// =======

export const PrimitiveMinaEventGenericConfig = PrimitiveConfigBaseMina
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.MinaEventGeneric),
      address: TypeboxHelpers.Mina.Address,
      scheduledPrefix: Type.String(),
      name: Type.String(),
    }),
    optional: Type.Object({}),
  });

export const PrimitiveMinaActionGenericConfig = PrimitiveConfigBaseMina
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.MinaActionGeneric),
      address: TypeboxHelpers.Mina.Address,
      scheduledPrefix: Type.String(),
      name: Type.String(),
    }),
    optional: Type.Object({}),
  });
