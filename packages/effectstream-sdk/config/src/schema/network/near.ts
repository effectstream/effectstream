import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import type { MergeIntersects } from "@effectstream/utils";

export const ConfigNetworkSchemaNear = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.NEAR),
    rpcUrl: Type.String({
      description: "NEAR JSON-RPC URL (e.g. http://localhost:3030)",
    }),
  }),
  optional: Type.Object({
    networkId: Type.String({
      default: "localnet",
      description: "NEAR network ID: mainnet, testnet, or localnet",
    }),
  }),
});

export type ConfigNetworkNear = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaNear.allProperties<true>>>
>;
