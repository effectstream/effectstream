import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import { type MergeIntersects } from "@effectstream/utils";

// ===========
// Base schema
// ===========

/**
 * Synthetic test network. Blocks are computed arithmetically:
 *   timestamp(page) = startTime + blockTimeMS * page
 * exactly like NTP, so it can act as either the main clock (TEST_MAIN) or a
 * parallel chain (TEST_PARALLEL). Used only by the deterministic sync tests;
 * excluded from the publish script.
 */
export const ConfigNetworkSchemaTest = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.TEST),
    startTime: Type.Number(),
    blockTimeMS: Type.Number(),
  }),
  optional: Type.Object({}),
});
export type ConfigNetworkTest = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaTest.allProperties<true>>>
>;
