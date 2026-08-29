import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../../utils.ts";
import { ConfigNetworkType } from "../types.ts";
import type { MergeIntersects } from "@effectstream/utils";

// =====
// Utils
// =====

// none

// ===========
// Base schema
// ===========

export const ConfigNetworkSchemaMidnight = new ConfigSchema({
  required: Type.Object({
    type: Type.Literal(ConfigNetworkType.MIDNIGHT),
    /**
     * Canonical Midnight network identifier string
     * (e.g. "undeployed", "devnet", "testnet", "preview").
     */
    networkId: Type.String(),
  }),
  optional: Type.Object({
    name: Type.String(),
  }),
  defaults: {
    name: "midnight" as const,
  },
});
export type ConfigNetworkMidnight = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaMidnight.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

// none
