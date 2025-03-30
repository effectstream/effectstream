import type { BlockNumber, EvmRpcPageJson, TimestampMs } from "@paima/utils";
import { TypeboxHelpers } from "@paima/utils";
import type { Chain, GetBlockReturnType } from "viem";
import type { PageSyncRange } from "../common/page-helpers.ts";
import { Type } from "@sinclair/typebox";

export type Page = BlockNumber;
const PageJsonSchema = Type.Unsafe<
  EvmRpcPageJson
>(Type.String());
export const PageSchema = TypeboxHelpers.JsonUnsafeCast<
  Page,
  typeof PageJsonSchema
>(PageJsonSchema);

// TODO
export type PrimitiveType = {
  value: number;
  block: GetBlockReturnType<Chain>;
  timestamp: TimestampMs;
};
export type Input = PageSyncRange<Page>;
export type Output = {
  raw: GetBlockReturnType<Chain>;
  primitives: PrimitiveType[];
};

/**
 * recall: EVM blocks use second resolution, but we want ms resolution
 */
export function toMsTimestamp(timestamp: bigint): TimestampMs {
  return Number(timestamp) * 1000;
}
