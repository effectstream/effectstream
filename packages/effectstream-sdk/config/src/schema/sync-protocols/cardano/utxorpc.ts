import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import { NameField, StartStopChainPoint } from "../../common.ts";
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
  exact_address: Type.Optional(Type.String()),
  payment_part: Type.Optional(Type.String()),
  delegation_part: Type.Optional(Type.String()),
});
export type UtxorpcAddressPattern = Static<typeof UtxorpcAddressPattern>;

export const UtxorpcAssetPattern = Type.Object({
  policy_id: Type.Optional(Type.String()),
  asset_name: Type.Optional(Type.String()),
});
export type UtxorpcAssetPattern = Static<typeof UtxorpcAssetPattern>;

export const UtxorpcTxOutputPattern = Type.Object({
  address: Type.Optional(UtxorpcAddressPattern),
  asset: Type.Optional(UtxorpcAssetPattern),
});
export type UtxorpcTxOutputPattern = Static<typeof UtxorpcTxOutputPattern>;

export const UtxorpcTxPattern = Type.Object({
  has_address: Type.Optional(UtxorpcAddressPattern),
  moves_asset: Type.Optional(UtxorpcAssetPattern),
  mints_asset: Type.Optional(UtxorpcAssetPattern),
  has_certificate: Type.Optional(Type.Boolean()),
});
export type UtxorpcTxPattern = Static<typeof UtxorpcTxPattern>;

export const UtxorpcAnyChainTxPattern = Type.Object({
  cardano: Type.Optional(UtxorpcTxPattern),
});
export type UtxorpcAnyChainTxPattern = Static<typeof UtxorpcAnyChainTxPattern>;

export const UtxorpcTxPredicate = Type.Recursive(This => Type.Object({
  match: Type.Optional(UtxorpcAnyChainTxPattern),
  not: Type.Optional(Type.Array(This)),
  all_of: Type.Optional(Type.Array(This)),
  any_of: Type.Optional(Type.Array(This)),
}));
export type UtxorpcTxPredicate = Static<typeof UtxorpcTxPredicate>;

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaCardanoUtxoRpcBase = NameField
  .cloneMerge(
    StartStopChainPoint,
  ).cloneMerge({
    required: Type.Object({
      name: Type.String(),
      rpcUrl: Type.String(),
    }),
    optional: Type.Object({
      headers: Type.Record(Type.String(), Type.String()),
      // Fetch-backpressure cap (utxorpc has no stepSize → defaults apply). See the
      // "Backpressure (`maxBufferedPages`)" section in @effectstream/sync's README.
      maxBufferedPages: Type.Optional(Type.Number()),
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
