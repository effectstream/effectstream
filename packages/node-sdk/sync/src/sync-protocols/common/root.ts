import type { BlockNumber, TimestampMs } from "@paima/utils";
import type { PageRelation } from "../base/page.ts";

export type ChainPage = TimestampMs;
export type ChainBlock = {
  blockNumber: BlockNumber;
  timestamp: TimestampMs;
  primitives: any[]; // TODO
};

export const chainPageRelation: PageRelation<ChainPage> = {
  compare: (p1, p2) => p1 - p2,
  equals: (p1, p2) => p1 === p2,
  min: (p1, p2) => (p1 < p2 ? p1 : p2),
  max: (p1, p2) => (p1 > p2 ? p1 : p2),
};
