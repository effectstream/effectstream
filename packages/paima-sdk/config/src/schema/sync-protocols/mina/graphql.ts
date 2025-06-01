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

// =====
// Utils
// =====

export const MinaDbCursor = TypeboxHelpers.Mina.TxHash;

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaMinaBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(
  StartStopBlockheight,
).cloneMerge({
  required: Type.Object({
    name: Type.String(),
    archiveConnectionString: Type.String(),
  }),
  optional: Type.Object({
    stepSize: Type.Number({ default: 1000 }),
    paginationLimit: Type.Number({ default: 50 }),
  }),
});

export const CommonResponseMinaDbBase = {
  internal: {
    cursor: MinaDbCursor,
  },
  payload: {
    primitiveName: Type.String(),
    caip2: TypeboxHelpers.Caip2,
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    transactionHash: TypeboxHelpers.Mina.TxHash,
    contractAddress: TypeboxHelpers.Mina.Address,
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ==========================
// Variant 2: parallel config
// ==========================

const blockTime: IntervalMs = 3 * 60 * 1000; // 3 minutes
/**
 * Mina has probabilistic finality, and rollbacks take 290 blocks to avoid
 * since that's not realistic, we just arbitrarily pick 2 blocks
 */
const finalityDepth = 2;

export const ConfigSyncProtocolSchemaMinaParallel =
  ConfigSyncProtocolSchemaMinaBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.MINA_PARALLEL),
      }),
      optional: Type.Object({
        // blocks are only approximately, but could be much longer so we add an extra delay
        ...waitingPeriodFromDepth(finalityDepth, blockTime, {
          factor: 2,
          absolute: 0,
        }),
      }),
    });
export type ConfigSyncProtocolMinaParallel = MergeIntersects<
  Static<
    ReturnType<typeof ConfigSyncProtocolSchemaMinaParallel.allProperties<true>>
  >
>;

export const CommonResponseMinaDbParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseMinaDbBase,
);
