import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "../types.ts";
import {
  NameField,
  PollingSyncProtocol,
  StartStopBlockheight,
} from "../../common.ts";
import { type MergeIntersects, TypeboxHelpers } from "@effectstream/utils";
import {
  CommonResponseParallelSyncProtocol,
  type ConfigSyncProtocolCommonResponse,
  genCommonResponse,
} from "../common.ts";

// ===========
// Base schema
// ===========

export const ConfigSyncProtocolSchemaTestBase = NameField.cloneMerge(
  PollingSyncProtocol,
).cloneMerge(StartStopBlockheight).cloneMerge({
  required: Type.Object({}),
  optional: Type.Object({
    stepSize: Type.Number({ default: 1000 }),
  }),
});

export const CommonResponseTestBase = {
  internal: {},
  payload: {
    ownChain: Type.Object({
      blockNumber: TypeboxHelpers.BlockNumber(),
    }),
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

/**
 * A single deterministic event a TEST_PARALLEL chain will emit. When the
 * fetcher reaches `atBlock`, it emits one primitive carrying `payload`, which
 * flows through the merge + STF and lands in `effectstream.primitive_accounting`.
 */
const TestEvent = Type.Object({
  atBlock: Type.Number(),
  payload: Type.Unsafe<Record<string, unknown>>(
    Type.Object({}, { additionalProperties: true }),
  ),
});

// ======================
// TEST_MAIN config (clock)
// ======================

export const ConfigSyncProtocolSchemaTestMain = ConfigSyncProtocolSchemaTestBase
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigSyncProtocolType.TEST_MAIN),
    }),
    optional: Type.Object({}),
  });
export type ConfigSyncProtocolTestMain = MergeIntersects<
  Static<ReturnType<typeof ConfigSyncProtocolSchemaTestMain.allProperties<true>>>
>;

export const CommonResponseTestMain = genCommonResponse(
  CommonResponseTestBase,
);

// ==============================
// TEST_PARALLEL config (events)
// ==============================

export const ConfigSyncProtocolSchemaTestParallel =
  ConfigSyncProtocolSchemaTestBase
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigSyncProtocolType.TEST_PARALLEL),
      }),
      optional: Type.Object({
        delayMs: TypeboxHelpers.IntervalMs({ default: 0 }),
        events: Type.Array(TestEvent, { default: [] }),
      }),
    });
export type ConfigSyncProtocolTestParallel = MergeIntersects<
  Static<
    ReturnType<typeof ConfigSyncProtocolSchemaTestParallel.allProperties<true>>
  >
>;

export const CommonResponseTestParallel = genCommonResponse(
  CommonResponseParallelSyncProtocol,
  CommonResponseTestBase,
);
