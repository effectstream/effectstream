import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import { NameField, PollingSyncProtocol, StartStopSlot } from "../../common.ts";
import {
  CommonResponseParallelSyncProtocol,
  type ConfigSyncProtocolCommonResponse,
  genCommonResponse,
  waitingPeriodFromDepth,
} from "../common.ts";
import {
  type CardanoBlockHash,
  type CardanoTxHash,
  type IntervalMs,
  type MergeIntersects,
  TypeboxHelpers,
} from "@paima/utils";

// =====
// Utils
// =====

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaCardanoUtxoRpcBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(
  StartStopSlot,
).cloneMerge({
  required: Type.Object({
    name: Type.String(),
    rpcUrl: Type.String(),
  }),
  optional: Type.Object({}),
});

export const CommonResponseCardanoCarpBase = {
  internal: {},
  payload: {
    primitiveName: Type.String(),
    caip2: TypeboxHelpers.Caip2,
    ownChain: Type.Object({
      absoluteSlotNumber: TypeboxHelpers.AbsoluteSlotNumber(),
    }),
    transactionHash: TypeboxHelpers.Cardano.TxHash,
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ==========================
// Variant2: parallel config
// ==========================

/**
 * Cardano block times are not deterministic, but it's approximately 20 seconds
 */
const blockTimeMs: IntervalMs = 20 * 1000;
/**
 * Cardano has probabilistic finality, and rollbacks take "k" (1 day) to avoid
 * since that's not realistic, we just arbitrarily pick 5 blocks
 */
const finalityDepth = 5;

export const ConfigSyncProtocolSchemaCardanoCarpParallel =
  ConfigSyncProtocolSchemaCardanoUtxoRpcBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.CARDANO_CARP_PARALLEL),
      }),
      optional: Type.Object({
        // blocks are only approximately, but could be much longer so we add an extra delay
        ...waitingPeriodFromDepth(finalityDepth, blockTimeMs, {
          factor: 2,
          absolute: 0,
        }),
      }),
    });
export type ConfigSyncProtocolCardanoParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaCardanoCarpParallel.allProperties<true>
    >
  >
>;

export const CommonResponseCardanoCarpParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseCardanoCarpBase,
);
