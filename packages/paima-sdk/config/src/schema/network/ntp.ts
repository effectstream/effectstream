import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import {
  type DeepReadonly,
  type MergeIntersects,
  TypeboxHelpers,
} from "@paima/utils";

// =====
// Utils
// =====

export const BlockExplorer = Type.Object({
  name: Type.String(),
  url: Type.String(),
  apiUrl: Type.Optional(Type.String()),
});
const RpcUrlInternal = Type.Object({
  http: Type.Array(Type.String()),
  webSocket: Type.Optional(Type.Array(Type.String())),
});

export const RpcUrls = Type.Unsafe<DeepReadonly<Static<typeof RpcUrlInternal>>>(
  RpcUrlInternal,
);

export const ChainNativeCurrency = Type.Object({
  name: Type.String(),
  symbol: Type.String({ minLength: 2, maxLength: 6 }),
  decimals: Type.Number(),
});

// ===========
// Base schema
// ===========

/**
 * Note: this tries as much as possible to follow Viem's network definition format
 *       we can't map it exactly because viem allows for some non-JSON serializable fields
 */
export const ConfigNetworkSchemaNtp = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.NTP),
    startTime: Type.Number(),
    blockTimeMS: Type.Number(),
  }),
  optional: Type.Object({
    servers: Type.Array(Type.String()),
  }),
});
export type ConfigNetworkNtp = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaNtp.allProperties<true>>>
>;
