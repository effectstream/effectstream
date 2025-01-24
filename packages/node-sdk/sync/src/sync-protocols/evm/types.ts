import type { BlockNumber, TimestampMs } from "@paima/utils";
import type { Chain, GetBlockReturnType } from "viem";
import type { PageSyncRange } from "../common/page-helpers.ts";

export type Page = BlockNumber;
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
