import {
  type IntervalMs,
  type ShallowMergeIntersects,
  TypeboxHelpers,
  type UnionToIntersection,
} from "@paima/utils";
import { type TObject, type TProperties, Type } from "@sinclair/typebox";

/**
 * How deep a block needs to be before the sync protocol considers it
 * ex: 0 -> instant finality
 * DANGER: this will block all sync protocols if we're waiting for this block to become finalized
 *
 * See parallel sync protocol docs for more
 */
export const ConfirmationDepth = (defaultDepth: number) =>
  Type.Number({ default: defaultDepth });

/**
 * How old should a block be before we block waiting for it to become finalized
 * ex: 0 -> consider the block as soon as it appears onchain
 * Note: this is generally (confirmationDepth * blockTime) + some buffer
 *
 *  The delay is used to account for the fact that
 *  a) some chains have approximate block time (ex: 2s +- 0.1)
 *  b) network latency means a block created might take a bit longer to get to you
 *
 * See parallel sync protocol docs for more
 */
export const Delay = (delayMs: IntervalMs) =>
  TypeboxHelpers.IntervalMs({ default: delayMs });

export function waitingPeriodFromDepth(
  defaultDepth: number,
  blockTimeMs: IntervalMs,
  offset: { factor?: number; absolute?: number } = {},
) {
  let delayMs: IntervalMs = defaultDepth * blockTimeMs;
  if (offset.factor != null) delayMs *= offset.factor;
  if (offset.absolute != null) delayMs += offset.absolute;
  return {
    confirmationDepth: ConfirmationDepth(defaultDepth),
    delayMs: Delay(delayMs),
  };
}

export type ConfigSyncProtocolCommonResponse = {
  /**
   * Fields that don't affect the hash
   */
  internal: TProperties;
  payload: TProperties;
};
export const CommonResponseParallelSyncProtocol = {
  internal: {},
  payload: {
    /**
     * Note: fields here do not exist during the presync stage
     * Exception: when the sync protocol is the same as the main one
     *            but this depends on the exact sync protocol
     *            ex: eth_getLogs doesn't return timestamps
     */
    mainchain: Type.Object({
      blockNumber: TypeboxHelpers.Nullable(TypeboxHelpers.BlockNumber()),
      timestamp: TypeboxHelpers.Nullable(TypeboxHelpers.TimestampMs()),
    }),
  },
} as const satisfies ConfigSyncProtocolCommonResponse;

export function genCommonResponse<
  const T extends ConfigSyncProtocolCommonResponse[],
>(
  ...properties: T
): TObject<{
  internal: TObject<
    ShallowMergeIntersects<
      UnionToIntersection<
        {
          [A in keyof T]: T[A]["internal"];
        }[keyof T & number]
      >
    >
  >;
  payload: TObject<
    ShallowMergeIntersects<
      UnionToIntersection<
        {
          [A in keyof T]: T[A]["payload"];
        }[keyof T & number]
      >
    >
  >;
}> {
  return Type.Object({
    internal: Type.Object(
      Object.assign({}, ...properties.map((prop) => prop.internal)),
    ),
    payload: Type.Object(
      Object.assign({}, ...properties.map((prop) => prop.payload)),
    ),
  }) as any;
}
