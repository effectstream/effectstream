import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import type { MergeIntersects } from "@paima/utils";

// =====
// Utils
// =====

export const CardanoNetwork = Type.Union([
  Type.Literal("preview"),
  Type.Literal("preprod"),
  Type.Literal("mainnet"),
  Type.Literal("yaci"),
]);

// ===========
// Base schema
// ===========

export const ConfigNetworkSchemaCardano = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.CARDANO),
    network: CardanoNetwork,
  }),
  optional: Type.Object({}),
});
export type ConfigNetworkCardano = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaCardano.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

// none
