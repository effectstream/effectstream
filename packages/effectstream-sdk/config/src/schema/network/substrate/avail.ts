import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../../utils.ts";
import { ConfigNetworkType } from "../types.ts";
import type { MergeIntersects } from "@effectstream/utils";
import { TypeboxHelpers } from "@effectstream/utils";

// =====
// Utils
// =====

// none

// ===========
// Base schema
// ===========

export const ConfigNetworkSchemaAvail = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.AVAIL),
    genesisSeed: Type.String(),
    caip2: TypeboxHelpers.Caip2,
    nodeUrl: Type.String(),
    genesisHash: Type.String(),
  }),
  optional: Type.Object({}),
});
export type ConfigNetworkAvail = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaAvail.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

// none
