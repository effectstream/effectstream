import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../../utils.ts";
import { ConfigNetworkType } from "../types.ts";
import { type MergeIntersects, TypeboxHelpers } from "@effectstream/utils";

// =====
// Utils
// =====

/**
 * This will be the network identifier of the Substrate chain.
 * In Substrate it is always the genesis hash of the network (hash of the first block)
 * You can retrieve this easily by going to PolkadotJS and looking for the hash on block 0
 * e.g. for Kusama it is 0xb0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe.
 */
export const SubstrateGenesisHash = TypeboxHelpers.HexString0x({
  maxLength: 66, // 64 + '0x'.length
  minLength: 66,
});

// ===========
// Base schema
// ===========

export const ConfigNetworkSchemaSubstrate = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.SUBSTRATE),
    genesisHash: SubstrateGenesisHash,
  }),
  optional: Type.Object({}),
});
export type ConfigNetworkSubstrate = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaSubstrate.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

// none
