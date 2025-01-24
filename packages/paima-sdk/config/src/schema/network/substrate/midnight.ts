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

export const ConfigNetworkSchemaMidnight = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.MIDNIGHT),
    /**
     * TODO: possibly this should switch to either
     * - a string following @midnight-ntwrk/midnight-js-network-id
     * - a genesis hash (following Substrate standard)
     *
     * 0 for localhost
     * 1 for devnet
     */
    networkId: Type.Number(),
    genesisHash: SubstrateGenesisHash,
  }),
  optional: Type.Object({}),
});
export type ConfigNetworkMidnight = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaMidnight.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

// none
