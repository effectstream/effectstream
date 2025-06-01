import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import {
  NameField,
  PollingSyncProtocol,
  StartStopBlockheight,
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
} from "@paima/utils";

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaAvailBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(
  StartStopBlockheight,
).cloneMerge({
  required: Type.Object({
    name: Type.String(),
    rpc: Type.String(),
    lightClient: Type.String(),
  }),
  optional: Type.Object({
    blockGroupSize: Type.Number({ default: 100 }),
    stepSize: Type.Number({ default: 1000 }),
  }),
});

export const CommonResponseAvailRpcBase = {
  internal: {},
  payload: {
    primitiveName: Type.String(),
    caip2: TypeboxHelpers.Caip2,
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    /**
     * Recall: in Substrate, tx hashes are not unique
     *         rather, you have to use blockNumber + extrinsicIndex
     */
    extrinsicIndex: Type.Number(),
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ======================
// Variant 1: main config
// ======================

export const ConfigSyncProtocolSchemaAvailMain =
  ConfigSyncProtocolSchemaAvailBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.AVAIL_MAIN),
      }),
      optional: Type.Object({}),
    });
export type ConfigSyncProtocolAvailMain = MergeIntersects<
  Static<
    ReturnType<typeof ConfigSyncProtocolSchemaAvailMain.allProperties<true>>
  >
>;

export const CommonResponseAvailRpcMain = genCommonResponse(
  CommonResponseAvailRpcBase,
);

// ==========================
// Variant 2: parallel config
// ==========================

const blockTimeMs: IntervalMs = 20 * 1000; // 20 seconds
/**
 * Finality is probabilistic, but it's ~3 blocks (60s)
 */
const finalityDepth = 3; // 3 blocks

export const ConfigSyncProtocolSchemaAvailParallel =
  ConfigSyncProtocolSchemaAvailBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.AVAIL_PARALLEL),
      }),
      optional: Type.Object({
        ...waitingPeriodFromDepth(finalityDepth, blockTimeMs, {
          absolute: blockTimeMs,
        }),
      }),
    });
export type ConfigSyncProtocolAvailParallel = MergeIntersects<
  Static<
    ReturnType<typeof ConfigSyncProtocolSchemaAvailParallel.allProperties<true>>
  >
>;

export const CommonResponseAvailRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseAvailRpcBase,
);
