import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  SyncProtocolWithNetwork,
} from "@effectstream/config";
import type { BlockNumber } from "@effectstream/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type { PageRelation } from "../base/page.ts";

// =====================
// Sync protocol typings
// =====================

/** The page identifier for NEAR: a block height + hash pair */
export type Page = {
  height: BlockNumber;
  hash: string;
};

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.NEAR_RPC_PARALLEL
>;

export type Input = PageSyncRange<BlockNumber>;

export type Output = {
  /** Block timestamp in milliseconds (converted from NEAR nanoseconds) */
  timestamp: number;
  /** Block height */
  height: number;
  /** Base58 block hash */
  hash: string;
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
  { syncProtocolType: ConfigSyncProtocolType.NEAR_RPC_PARALLEL }
>;
