import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSchema } from "../utils.ts";
import { ConfigNetworkType } from "./types.ts";
import {
  type DeepReadonly,
  type MergeIntersects,
  TypeboxHelpers,
} from "@paima/utils";
import type { Chain, ChainFormatters } from "viem";

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
export const ConfigNetworkSchemaEvm = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.EVM),
    chainId: Type.Number(),
    nativeCurrency: ChainNativeCurrency,
    rpcUrls: Type.Intersect([
      Type.Record(Type.String(), RpcUrls),
      Type.Object({ default: RpcUrls }),
    ]),
  }),
  optional: Type.Object({
    blockExplorers: TypeboxHelpers.Nullable(
      Type.Intersect([
        Type.Record(Type.String(), BlockExplorer),
        Type.Object({ default: BlockExplorer }),
      ]),
      { default: null },
    ),
    /** Source Chain ID (ie. the L1 chain) */
    sourceId: TypeboxHelpers.Nullable(Type.Number(), { default: null }),
    testnet: Type.Boolean({ default: false }),
  }),
});
export type ConfigNetworkEvm = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaEvm.allProperties<true>>>
>;

// ===========
// Conversions
// ===========

export type MapNetworkTypes<chain extends Chain<ChainFormatters>> =
  & Omit<chain, "id">
  & {
    chainId: chain["id"];
    type: ConfigNetworkType.EVM;
    blockExplorers: NonNullable<chain["blockExplorers"]> | null;
    sourceId: NonNullable<chain["sourceId"]> | null;
    testnet: NonNullable<chain["testnet"]> | false;
  };

export function viemToConfigNetwork(
  chain: Chain<ChainFormatters>,
): ConfigNetworkEvm {
  const network = {
    ...chain,
    type: ConfigNetworkType.EVM as const,
    chainId: chain.id,
    blockExplorers: chain.blockExplorers ?? null,
    sourceId: chain.sourceId ?? null,
    testnet: chain.testnet ?? false,
  };
  return network;
}
export function ConfigNetworkToViem(
  chain: ConfigNetworkEvm,
): Chain<ChainFormatters> {
  const network = {
    ...chain,
    id: chain.chainId,
    blockExplorers: chain.blockExplorers ?? undefined,
    sourceId: chain.sourceId ?? undefined,
  };
  return network;
}
