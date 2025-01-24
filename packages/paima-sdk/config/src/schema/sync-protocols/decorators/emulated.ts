import { Type } from "@sinclair/typebox";
import { ConfigSchema } from "../../utils.ts";
import { ConfigSyncProtocolDecoratorType } from "./types.ts";
import { TypeboxHelpers } from "@paima/utils";

export const ConfigSyncProtocolSchemaEmulated = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    blockTimeMs: TypeboxHelpers.IntervalMs(),
    type: Type.Literal(ConfigSyncProtocolDecoratorType.EMULATED),
  }),
  optional: Type.Object({}),
});
