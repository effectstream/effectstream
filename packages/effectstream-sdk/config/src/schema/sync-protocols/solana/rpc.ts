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
        /**
         * How the protocol reads Solana (AA 00064):
         * - `block` (default): `getSlot` then `getBlock` for every slot, up to
         *   `latest − confirmationDepth`, `stepSize` slots per pass;
         * - `program`: only the transactions of the programs its
         *   `SOLANA:ProgramLog` primitives watch. Each poll, every
         *   `pollingInterval`, is `getSlot(finalized)` + `getBlockTime` +
         *   `getSignaturesForAddress` per program, then `getTransaction` per new
         *   transaction. It takes no other primitive type, and ignores
         *   `stepSize`, `confirmationDepth`, `getBlockConcurrency` and
         *   `getBlockMinIntervalMs`. Each mode refuses the other's database.
         */
        mode: Type.Union([Type.Literal("block"), Type.Literal("program")], {
          default: "block",
        }),
        // getBlock reading (the fetcher's defaults apply when unset):
        /** Highest transaction version a block (or, in program mode, a transaction) is requested with (default 1). */
        maxSupportedTransactionVersion: Type.Number(),
        /** Minimum spacing between getBlock calls, in ms (default 0: no pacing). */
        getBlockMinIntervalMs: Type.Number(),
        /** Most getBlock calls in flight at once (default 8; halved after a rate-limited batch). */
        getBlockConcurrency: Type.Number(),
        /** Waits on HTTP 429 per slot (program mode: per call) before it counts as failed (default 10). */
        rateLimitRetries: Type.Number(),
        /** First wait on HTTP 429, doubled each time (default 500 ms). */
        rateLimitBackoffMs: Type.Number(),
        /** Longest wait on HTTP 429 (default 15000 ms); a Retry-After header wins if longer. */
        rateLimitMaxBackoffMs: Type.Number(),
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
