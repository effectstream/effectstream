import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  SyncProtocolWithNetwork,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type { PageRelation } from "../base/page.ts";

export type AvailStatus = {
  modes: string[];
  app_id: number;
  genesis_hash: string;
  network: string;
  blocks: {
    latest: number;
    available?: {
      first: number;
      last: number;
    };
    app_data?: {
      first: number;
      last: number;
    };
  };
}

export type AvailBlockHeader = {
  hash: `0x${string}`;
  parent_hash: `0x${string}`;
  number: number;
  state_root: `0x${string}`;
  extrinsics_root: `0x${string}`;
  extension: {
    rows: number;
    cols: number;
    data_root: `0x${string}`;
    commitments: string[];
    app_lookup: {
      size: number;
      index: {
        appId: number;
        start: number;
      }[];
    };
  };
  received_at: number;
};

export type AvailBlockDataItem = {
  block_number: number;
  data_transactions: {
    data: string; // BASE64 encoded data
    extrinsic: string;
  }[];
};

export type AvailBlock = {
  header: AvailBlockHeader;
  extrinsics: string[];
};

// =====================
// Sync protocol typings
// =====================

export type Page = {
  height: BlockNumber;
  hash: `0x${string}`;
};

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.AVAIL_PARALLEL
>;

export type Input = PageSyncRange<BlockNumber>;
export type Output = {
  raw: AvailBlockHeader;
  primitives: PrimitiveType[];
};

export const pageRelation: PageRelation<Page> = {
  compare: (p1, p2) => p1.height - p2.height,
  equals: (p1, p2) => p1.height === p2.height,
  min: (p1, p2) => (p1.height < p2.height ? p1 : p2),
  max: (p1, p2) => (p1.height > p2.height ? p1 : p2),
};

export type ConfigType = Extract<
  SyncProtocolWithNetwork,
  { syncProtocolType: ConfigSyncProtocolType.AVAIL_PARALLEL }
>;
