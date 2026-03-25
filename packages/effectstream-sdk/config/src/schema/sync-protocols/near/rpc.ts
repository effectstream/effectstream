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
} from "@effectstream/utils";

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaNearBase = NameField.cloneMerge(
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
});

export const CommonResponseNearRpcBase = {
  internal: {},
  payload: {
    primitiveName: Type.String(),
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    contractId: Type.String(),
    eventStandard: Type.String(),
    eventType: Type.String(),
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ==========================
// Variant: parallel config
// ==========================

const blockTimeMs: IntervalMs = 1200; // ~1.2 second NEAR block time
const finalityDepth = 1; // doomslug has near-instant finality

export const ConfigSyncProtocolSchemaNearParallel =
  ConfigSyncProtocolSchemaNearBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.NEAR_RPC_PARALLEL),
      }),
      optional: Type.Object({
        ...waitingPeriodFromDepth(finalityDepth, blockTimeMs, {
          absolute: blockTimeMs,
        }),
      }),
    });

export type ConfigSyncProtocolNearParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaNearParallel.allProperties<true>
    >
  >
>;

export const CommonResponseNearRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseNearRpcBase,
);
