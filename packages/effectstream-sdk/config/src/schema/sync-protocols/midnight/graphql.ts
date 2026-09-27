import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import {
  NameField,
  pollingSyncProtocolWithDefault,
  StartStopBlockheightWithLatest,
} from "../../common.ts";
import {
  CommonResponseParallelSyncProtocol,
  type ConfigSyncProtocolCommonResponse,
  genCommonResponse,
  waitingPeriodFromDepth,
} from "../common.ts";
import {
  type IntervalMs,
  type MergeIntersects,
  TypeboxHelpers,
} from "@effectstream/utils";

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaMidnightBase = NameField.cloneMerge(
  pollingSyncProtocolWithDefault(6_000),
).cloneMerge(StartStopBlockheightWithLatest).cloneMerge({
  required: Type.Object({
    indexer: Type.String(),
    // note: node URL and proof server are not needed for read-only use
  }),
  optional: Type.Object({
    stepSize: Type.Number({ default: 10 }),
    paginationLimit: Type.Number({ default: 50 }),
  }),
});

export const CommonResponseMidnightGraphqlBase = {
  internal: {},
  payload: {
    primitiveName: Type.String(),
    caip2: TypeboxHelpers.Caip2,
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    transactionHash: TypeboxHelpers.Midnight.TxHash,
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ==========================
// Variant 2: parallel config
// ==========================

const blockTime: IntervalMs = 6 * 1000; // 6 seconds
/**
 * finality is "2~3 blocks", so we pick the larger of the two
 */
const finalityDepth = 3;

export const ConfigSyncProtocolSchemaMidnightParallel =
  ConfigSyncProtocolSchemaMidnightBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.MIDNIGHT_PARALLEL),
      }),
      optional: Type.Object({
        ...waitingPeriodFromDepth(finalityDepth, blockTime, {
          absolute: 2 * 1000,
        }),
      }),
    });
export type ConfigSyncProtocolMidnightParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaMidnightParallel.allProperties<true>
    >
  >
>;

export const CommonResponseMidnightGraphqlParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseMidnightGraphqlBase,
);
