import { TypeboxHelpers } from "@effectstream/utils";
import { Type } from "@sinclair/typebox";
import { ConfigSchema } from "./utils.ts";

export const NameField = new ConfigSchema({
  required: Type.Object({
    name: Type.String(),
  }),
  optional: Type.Object({}),
});

export const PollingSyncProtocol = new ConfigSchema({
  required: Type.Object({
    pollingInterval: TypeboxHelpers.IntervalMs(),
  }),
  optional: Type.Object({}),
});

export const StartStopBlockheight = new ConfigSchema({
  required: Type.Object({
    startBlockHeight: TypeboxHelpers.BlockNumber(),
  }),
  optional: Type.Object({
    stopBlockHeight: TypeboxHelpers.Nullable(TypeboxHelpers.BlockNumber(), {
      default: null,
    }),
  }),
});

export const StartStopSlot = new ConfigSchema({
  required: Type.Object({
    startSlot: TypeboxHelpers.AbsoluteSlotNumber(),
  }),
  optional: Type.Object({
    stopSlot: TypeboxHelpers.Nullable(TypeboxHelpers.AbsoluteSlotNumber(), {
      default: null,
    }),
  }),
});

export const StartStopTimestamp = new ConfigSchema({
  required: Type.Object({
    startTimestamp: TypeboxHelpers.TimestampMs(),
  }),
  optional: Type.Object({
    stopTimestamp: TypeboxHelpers.Nullable(TypeboxHelpers.TimestampMs(), {
      default: null,
    }),
  }),
});

export const AbiField = new ConfigSchema({
  required: Type.Object({
    abi: TypeboxHelpers.EvmAbiEvent,
  }),
  optional: Type.Object({}),
});
