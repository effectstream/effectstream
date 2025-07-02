import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import {
  NameField,
  PollingSyncProtocol,
  StartStopBlockheight,
} from "../../common.ts";
import { type MergeIntersects, TypeboxHelpers } from "@paima/utils";
import {
  CommonResponseParallelSyncProtocol,
  type ConfigSyncProtocolCommonResponse,
  genCommonResponse,
} from "../common.ts";

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaEvmBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(StartStopBlockheight).cloneMerge({
  required: Type.Object({
    chainUri: Type.String(),
  }),
  optional: Type.Object({
    stepSize: Type.Number({ default: 1000 }),
  }),
});

export const CommonResponseEvmRpcBase = {
  internal: {},
  payload: {
    primitiveName: Type.String(),
    caip2: TypeboxHelpers.Caip2,
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
      timestamp: TypeboxHelpers.TimestampMs(),
    }),
    transactionHash: TypeboxHelpers.Evm.TxHash,
    transactionIndex: Type.Number(),
    logIndex: Type.Number(),
    contractAddress: TypeboxHelpers.Evm.Address,
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ======================
// Variant 1: main config
// ======================

export const ConfigSyncProtocolSchemaEvmMain = ConfigSyncProtocolSchemaEvmBase
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigSyncProtocolType.EVM_RPC_MAIN),
    }),
    optional: Type.Object({}),
  });
export type ConfigSyncProtocolEvmMain = MergeIntersects<
  Static<ReturnType<typeof ConfigSyncProtocolSchemaEvmMain.allProperties<true>>>
>;

export const CommonResponseEvmRpcMain = genCommonResponse(
  CommonResponseEvmRpcBase,
);

// ==========================
// Variant 2: parallel config
// ==========================

export const ConfigSyncProtocolSchemaEvmParallel =
  ConfigSyncProtocolSchemaEvmBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.EVM_RPC_PARALLEL),
        confirmationDepth: Type.Number(),
      }),
      optional: Type.Object({
        delayMs: TypeboxHelpers.IntervalMs({ default: 2 * 1000 }),
      }),
    });
export type ConfigSyncProtocolEvmParallel = MergeIntersects<
  Static<
    ReturnType<typeof ConfigSyncProtocolSchemaEvmParallel.allProperties<true>>
  >
>;

export const CommonResponseEvmRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseEvmRpcBase,
);
