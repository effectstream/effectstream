import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import type { MergeIntersects } from "@effectstream/utils";

export const ConfigNetworkSchemaCelestia = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.CELESTIA),
    rpcUrl: Type.String({
      description: "Celestia Light Node RPC URL (e.g. http://localhost:26658)",
    }),
  }),
  optional: Type.Object({}),
});

export type ConfigNetworkCelestia = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaCelestia.allProperties<true>>>
>;
