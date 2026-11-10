import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { MergeIntersects } from "@effectstream/utils";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";

export const ConfigNetworkSchemaCkb = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.CKB),
    rpcUrl: Type.String({ pattern: "^https?://[^\\s]+$" }),
    network: Type.Union([
      Type.Literal("devnet"),
      Type.Literal("testnet"),
      Type.Literal("mainnet"),
    ]),
    genesisBlockHash: Type.String({ pattern: "^0x[0-9a-fA-F]{64}$" }),
  }),
  optional: Type.Object({}),
});

export type ConfigNetworkCkb = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaCkb.allProperties<true>>>
>;
