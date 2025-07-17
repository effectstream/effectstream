import type { PaimaBlockNumber, TimestampMs } from "@paima/utils";
import type { PageRelation } from "../base/page.ts";
import type {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";

export type ChainPage = TimestampMs;
export type ChainBlock = {
  blockNumber: PaimaBlockNumber;
  timestamp: TimestampMs;
  primitives: (
    & FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType,
      ConfigPrimitiveType,
      ConfigPrimitivePayloadType
    >
    & { source: string }
  )[];
};

export const chainPageRelation: PageRelation<ChainPage> = {
  compare: (p1, p2) => p1 - p2,
  equals: (p1, p2) => p1 === p2,
  min: (p1, p2) => (p1 < p2 ? p1 : p2),
  max: (p1, p2) => (p1 > p2 ? p1 : p2),
};
