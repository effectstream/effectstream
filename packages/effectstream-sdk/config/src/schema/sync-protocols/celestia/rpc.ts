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

export const ConfigSyncProtocolSchemaCelestiaBase = NameField.cloneMerge(
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

export const CommonResponseCelestiaRpcBase = {
  internal: {
    commitment: Type.String(),
  },
  payload: {
    primitiveName: Type.String(),
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    namespace: Type.String(),
    blobIndex: Type.Number(),
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ==========================
// Variant: parallel config
// ==========================

const blockTimeMs: IntervalMs = 12 * 1000; // ~12 second Celestia block time
const finalityDepth = 1; // CometBFT has instant finality

export const ConfigSyncProtocolSchemaCelestiaParallel =
  ConfigSyncProtocolSchemaCelestiaBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.CELESTIA_PARALLEL),
      }),
      optional: Type.Object({
        ...waitingPeriodFromDepth(finalityDepth, blockTimeMs, {
          absolute: blockTimeMs,
        }),
      }),
    });

export type ConfigSyncProtocolCelestiaParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaCelestiaParallel.allProperties<true>
    >
  >
>;

export const CommonResponseCelestiaRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseCelestiaRpcBase,
);
