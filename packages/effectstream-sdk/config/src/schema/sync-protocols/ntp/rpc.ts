import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import {
  NameField,
  pollingSyncProtocolWithDefault,
  StartStopBlockheight,
} from "../../common.ts";
import { type MergeIntersects, TypeboxHelpers } from "@effectstream/utils";
import {
  type ConfigSyncProtocolCommonResponse,
  genCommonResponse,
} from "../common.ts";

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaNtpBase = NameField.cloneMerge(
  pollingSyncProtocolWithDefault(1_000),
).cloneMerge(StartStopBlockheight).cloneMerge({
  required: Type.Object({}),
  optional: Type.Object({
    stepSize: Type.Number({ default: 1000 }),
  }),
});

export const CommonResponseNtpBase = {
  internal: {},
  payload: {
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

// ======================
// NTP Main config
// ======================

export const ConfigSyncProtocolSchemaNtpMain = ConfigSyncProtocolSchemaNtpBase
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigSyncProtocolType.NTP_MAIN),
    }),
    optional: Type.Object({}),
  });
export type ConfigSyncProtocolNtpMain = MergeIntersects<
  Static<ReturnType<typeof ConfigSyncProtocolSchemaNtpMain.allProperties<true>>>
>;

export const CommonResponseNtpMain = genCommonResponse(
  CommonResponseNtpBase,
);
