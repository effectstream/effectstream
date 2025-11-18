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
} from "../common.ts";
import {
  type IntervalMs,
  type MergeIntersects,
  TypeboxHelpers,
} from "@effectstream/utils";

export const ConfigSyncProtocolSchemaBitcoinBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(StartStopBlockheight).cloneMerge({
  required: Type.Object({}),
  optional: Type.Object({
    stepSize: Type.Number({ default: 25 }),
  }),
});

const BitcoinDirection = Type.Union([
  Type.Literal("input"),
  Type.Literal("output"),
]);

export const CommonResponseBitcoinRpcBase = {
  internal: {
    transactionId: Type.String(),
  },
  payload: {
    primitiveName: Type.String(),
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
    direction: BitcoinDirection,
    address: Type.String(),
    transactionId: Type.String(),
    index: Type.Number(),
    valueSats: Type.Number(),
    utxo: Type.Object({
      txid: Type.String(),
      vout: Type.Number(),
    }),
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

const blockTimeMs: IntervalMs = 10 * 60 * 1000;

export const ConfigSyncProtocolSchemaBitcoinParallel =
  ConfigSyncProtocolSchemaBitcoinBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL),
        confirmationDepth: Type.Number({ default: 6 }),
      }),
      optional: Type.Object({
        delayMs: TypeboxHelpers.IntervalMs({ default: blockTimeMs }),
      }),
    });

export type ConfigSyncProtocolBitcoinParallel = MergeIntersects<
  Static<
    ReturnType<
      typeof ConfigSyncProtocolSchemaBitcoinParallel.allProperties<true>
    >
  >
>;

export const CommonResponseBitcoinRpcParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseBitcoinRpcBase,
);

