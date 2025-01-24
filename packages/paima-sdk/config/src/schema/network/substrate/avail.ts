import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../../utils.ts";
import { ConfigNetworkType } from "../types.ts";
import type { MergeIntersects } from "@paima/utils";
import { SubstrateGenesisHash } from "./common.ts";

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
    genesisHash: SubstrateGenesisHash,
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
