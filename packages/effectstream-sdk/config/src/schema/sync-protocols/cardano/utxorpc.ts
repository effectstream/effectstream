import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import { NameField, StartStopSlot } from "../../common.ts";
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
} from "@effectstream/utils";

// =====
// Utils
// =====

export const UtxorpcAddressPattern = Type.Object({
  exactAddress: Type.Optional(Type.String()),
  paymentPart: Type.Optional(Type.String()),
  delegationPart: Type.Optional(Type.String()),
});
export type UtxorpcAddressPattern = Static<typeof UtxorpcAddressPattern>;

export const UtxorpcAssetPattern = Type.Object({
  policyId: Type.Optional(Type.String()),
  assetName: Type.Optional(Type.String()),
});
export type UtxorpcAssetPattern = Static<typeof UtxorpcAssetPattern>;

export const UtxorpcTxOutputPattern = Type.Object({
  address: Type.Optional(UtxorpcAddressPattern),
  asset: Type.Optional(UtxorpcAssetPattern),
});
export type UtxorpcTxOutputPattern = Static<typeof UtxorpcTxOutputPattern>;

export const UtxorpcTxPattern = Type.Object({
  consumes: Type.Optional(UtxorpcTxOutputPattern),
  produces: Type.Optional(UtxorpcTxOutputPattern),
  hasAddress: Type.Optional(UtxorpcAddressPattern),
  movesAsset: Type.Optional(UtxorpcAssetPattern),
  mintsAsset: Type.Optional(UtxorpcAssetPattern),
});
export type UtxorpcTxPattern = Static<typeof UtxorpcTxPattern>;

export const UtxorpcTxPredicate = Type.Recursive(This => Type.Object({
  match: Type.Optional(UtxorpcTxPattern),
  not: Type.Optional(Type.Array(This)),
  allOf: Type.Optional(Type.Array(This)),
  anyOf: Type.Optional(Type.Array(This)),
}));
export type UtxorpcTxPredicate = Static<typeof UtxorpcTxPredicate>;

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaCardanoUtxoRpcBase = NameField
  .cloneMerge(
    StartStopSlot,
  ).cloneMerge({
    required: Type.Object({
      name: Type.String(),
      rpcUrl: Type.String(),
    }),
    optional: Type.Object({
      headers: Type.Record(Type.String(), Type.String()),
    }),
  });

export const CommonResponseCardanoUtxoRpcBase = {
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

export const ConfigSyncProtocolSchemaCardanoUtxoRpcParallel =
  ConfigSyncProtocolSchemaCardanoUtxoRpcBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL),
      }),
      optional: Type.Object({
        // blocks are only approximately, but could be much longer so we add an extra delay
        ...waitingPeriodFromDepth(finalityDepth, blockTimeMs, {
          factor: 2,
          absolute: 0,
        }),
      }),
    });
export type ConfigSyncProtocolCardanoUtxoRpcParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaCardanoUtxoRpcParallel.allProperties<true>
    >
  >
>;

export const CommonResponseCardanoUtxoRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseCardanoUtxoRpcBase,
);
