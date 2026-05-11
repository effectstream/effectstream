import type {
  BlockHash,
  BlockNumber,
  EffectstreamBlockNumber,
  TimestampMs,
} from "@effectstream/utils";
import type { PageRelation } from "../base/page.ts";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@effectstream/config";

export type ChainPage = TimestampMs;
export type ChainBlock = {
  blockNumber: EffectstreamBlockNumber;
  timestamp: TimestampMs;
  blockInfo: {
    protocol_name: string;
    block_number: BlockNumber;
    blockHash: BlockHash;
  }[];
  primitives: (
    & FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType
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
