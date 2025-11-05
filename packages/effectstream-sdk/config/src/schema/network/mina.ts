import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import type { MergeIntersects } from "@effectstream/utils";

// =====
// Utils
// =====

// none

// ===========
// Base schema
// ===========

export const ConfigNetworkSchemaMina = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.MINA),
    /**
     * String name of the network (https://github.com/ChainAgnostic/namespaces/blob/main/mina/caip2.md)
     */
    networkId: Type.String(),
  }),
  optional: Type.Object({}),
});
export type ConfigNetworkMina = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaMina.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

// none
