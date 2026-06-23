import { Type } from "@sinclair/typebox"
import type { Static } from "@sinclair/typebox"
import { ConfigSyncProtocolType } from "../types.ts"
import {
  NameField,
  PollingSyncProtocol,
  StartStopBlockheight,
} from "../../common.ts"
import {
  CommonResponseParallelSyncProtocol,
  type ConfigSyncProtocolCommonResponse,
  genCommonResponse,
  waitingPeriodFromDepth,
} from "../common.ts"
import {
  type IntervalMs,
  type MergeIntersects,
  TypeboxHelpers,
} from "@effectstream/utils"

export const ConfigSyncProtocolSchemaSolanaBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(
  StartStopBlockheight,
).cloneMerge({
  required: Type.Object({
    name: Type.String(),
  }),
  optional: Type.Object({
    stepSize: Type.Number({ default: 10 }),
    /**
     * Number of slots to stay behind the chain tip before a slot is eligible
     * for sync — the finality vs. latency knob. Higher = safer against reorgs,
     * lower = faster. Defaults to 32 (~12.8s at 400ms slots).
     */
    confirmationDepth: Type.Number({ default: 32 }),
  }),
})

export const CommonResponseSolanaRpcBase = {
  internal: {},
  payload: {
    primitiveName: Type.String(),
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    programId: Type.String(),
    eventType: Type.String(),
  },
} as const satisfies ConfigSyncProtocolCommonResponse

// ~400 ms Solana slot time; confirmationDepth=32 slots (~12.8 s) is a common
// safe threshold balancing latency vs reorg risk on mainnet.
const blockTimeMs: IntervalMs = 400
const finalityDepth = 32

export const ConfigSyncProtocolSchemaSolanaParallel =
  ConfigSyncProtocolSchemaSolanaBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.SOLANA_RPC_PARALLEL),
      }),
      optional: Type.Object({
        ...waitingPeriodFromDepth(finalityDepth, blockTimeMs, {
          absolute: blockTimeMs,
        }),
      }),
    })

export type ConfigSyncProtocolSolanaParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaSolanaParallel.allProperties<true>
    >
  >
>

export const CommonResponseSolanaRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseSolanaRpcBase,
)
