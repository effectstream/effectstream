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
    // Number of heights fetched concurrently within each window.
    // Default 1 preserves the original serial behaviour for deployments that
    // do not set this explicitly. Set to 8–16 for Mocha/mainnet to overlap the
    // ~10% of blob.GetAll calls that stall on shrex share retrieval.
    concurrency: Type.Number({ default: 1 }),
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
