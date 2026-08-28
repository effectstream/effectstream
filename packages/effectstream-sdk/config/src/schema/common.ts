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
  optional: Type.Object({
    /**
     * Intentionally has NO default, unlike its neighbour below. The effective
     * cap is derived from the protocol's `stepSize`
     * (`common/page-helpers.ts:bufferCapFor`), so a static default here would
     * override that per-chain sizing. `undefined` means "derive it".
     */
    maxBufferedPages: Type.Optional(Type.Number()),
    /**
     * Hard deadline for a single RPC request made by this protocol's client.
     *
     * `fetch` has no default timeout, so without this a blackholed endpoint
     * hangs `readData` forever and silently stalls block production — see
     * `@effectstream/sync` `sync-protocols/common/http.ts`. The fetch loop
     * supplies the retry; this only bounds one attempt.
     */
    requestTimeoutMs: TypeboxHelpers.IntervalMs({ default: 15_000 }),
  }),
});

/**
 * Protocol-owned polling default. Use this only when an integration has a
 * reviewed ordinary cadence; the shared schema intentionally keeps polling
 * required for every other protocol.
 */
export const PollingSyncProtocolWithDefault = (
  pollingInterval: number,
) =>
  new ConfigSchema({
    required: Type.Object({}),
    optional: Type.Object({
      pollingInterval: TypeboxHelpers.IntervalMs({
        default: pollingInterval,
      }),
      ...PollingSyncProtocol.config.optional.properties,
    }),
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

/** Start policy for protocols that snapshot one first-run local tip. */
export const StartStopBlockheightLatest = new ConfigSchema({
  required: Type.Object({
    startBlockHeight: Type.Union([
      TypeboxHelpers.BlockNumber(),
      Type.Literal("latest"),
    ]),
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

export const CardanoChainPoint = Type.Object({
  slot: TypeboxHelpers.AbsoluteSlotNumber(),
  hash: TypeboxHelpers.Cardano.BlockHash,
});

export const StartChainPointValue = Type.Union([
  Type.Literal("origin"),
  Type.Literal("tip"),
  CardanoChainPoint,
]);

export const StartStopChainPoint = new ConfigSchema({
  required: Type.Object({
    startChainPoint: StartChainPointValue,
  }),
  optional: Type.Object({
    stopChainPoint: TypeboxHelpers.Nullable(CardanoChainPoint, {
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
