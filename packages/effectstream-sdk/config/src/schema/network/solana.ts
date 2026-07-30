import { Type } from "@sinclair/typebox"
import type { Static } from "@sinclair/typebox"
import { ConfigSchema } from "../utils.ts"
import { ConfigNetworkType } from "./types.ts"
import type { MergeIntersects } from "@effectstream/utils"

export const ConfigNetworkSchemaSolana = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
    type: Type.Literal(ConfigNetworkType.SOLANA),
    rpcUrl: Type.String({
      description: "Solana JSON-RPC URL (e.g. http://localhost:8899)",
    }),
  }),
  optional: Type.Object({
    wsUrl: Type.String({
      description:
        "Solana WebSocket URL (e.g. ws://localhost:8900). Reserved: the RPC " +
        "sync protocol polls over HTTP and does not read this yet.",
    }),
    networkId: Type.Union(
      [
        Type.Literal("mainnet-beta"),
        Type.Literal("devnet"),
        Type.Literal("testnet"),
        Type.Literal("localnet"),
      ],
      { default: "localnet" },
    ),
  }),
})

export type ConfigNetworkSolana = MergeIntersects<
  Static<ReturnType<typeof ConfigNetworkSchemaSolana.allProperties<true>>>
>
