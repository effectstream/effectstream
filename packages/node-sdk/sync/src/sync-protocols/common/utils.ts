import type {
  AbsoluteSlotNumber,
  BlockNumber,
  IntervalMs,
  TimestampMs,
} from "@effectstream/utils";
import type { PageRelation } from "../base/page.ts";

export function applyDelay(
  timestamp: TimestampMs,
  delayMs: IntervalMs,
): TimestampMs {
  // note: plus ("+") here makes it look like this chain is further along than it is
  //       this is exactly what we want to make old blocks get merged into recent root data
  return Math.max(0, timestamp + delayMs);
}

export const blockNumberRelation: PageRelation<BlockNumber> = {
  compare: (p1, p2) => p1 - p2,
  equals: (p1, p2) => p1 === p2,
  min: (p1, p2) => (p1 < p2 ? p1 : p2),
  max: (p1, p2) => (p1 > p2 ? p1 : p2),
};
export const absSlotRelation: PageRelation<AbsoluteSlotNumber> = {
  compare: (p1, p2) => p1 - p2,
  equals: (p1, p2) => p1 === p2,
  min: (p1, p2) => (p1 < p2 ? p1 : p2),
  max: (p1, p2) => (p1 > p2 ? p1 : p2),
};
