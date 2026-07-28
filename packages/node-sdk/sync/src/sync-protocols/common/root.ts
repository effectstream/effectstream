import type {
  BlockHash,
  BlockNumber,
  EffectstreamBlockNumber,
  TimestampMs,
} from "@effectstream/utils";
import type { PageRelation } from "../base/page.ts";
import type { LastPage } from "../base/state.ts";
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
  /**
   * Per-protocol block-accurate resume markers the runtime persists on commit.
   * See `@effectstream/sync` CLAUDE.md, design idea #5 (restart/resume).
   */
  resumePages: {
    protocol_name: string;
    lastPage: LastPage<unknown, unknown>;
  }[];
  primitives: (
    & FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType
    >
    & { source: string }
  )[];
  coalescedCount?: number;
};

export const chainPageRelation: PageRelation<ChainPage> = {
  compare: (p1, p2) => p1 - p2,
  equals: (p1, p2) => p1 === p2,
  min: (p1, p2) => (p1 < p2 ? p1 : p2),
  max: (p1, p2) => (p1 > p2 ? p1 : p2),
};
