import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import {
  type MergeIntersects,
  TypeboxHelpers,
} from "@effectstream/utils";

const RpcAuth = Type.Object({
  username: Type.String(),
  password: Type.String(),
});

export const ConfigNetworkSchemaBitcoin = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.BITCOIN),
    rpcUrl: Type.String(),
  }),
  optional: Type.Object({
    rpcAuth: TypeboxHelpers.Nullable(RpcAuth, { default: null }),
    ordUrl: TypeboxHelpers.Nullable(Type.String(), { default: null }),
    network: Type.String({ default: "regtest" }),
    chainIdentifier: TypeboxHelpers.Nullable(Type.String(), { default: null }),
  }),
});

export type ConfigNetworkBitcoin = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaBitcoin.allProperties<true>>>
>;

