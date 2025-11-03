import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import type { MergeIntersects } from "@effectstream/utils";

// =====
// Utils
// =====

// TODO: can we replace this with the Typebox helper?
export const AlgorandGenesisHash = Type.RegExp(
  "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
);

// ===========
// Base schema
// ===========

export const ConfigNetworkSchemaAlgorand = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.ALGORAND),
    genesisHash: AlgorandGenesisHash,
  }),
  optional: Type.Object({}),
});
export type ConfigNetworkAlgorand = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaAlgorand.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

// none
