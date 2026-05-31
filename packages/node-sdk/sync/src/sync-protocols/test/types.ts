import type { BlockNumber, TimestampMs } from "@effectstream/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  SyncProtocolWithNetwork,
} from "@effectstream/config";

export type Page = BlockNumber;

export type ConfigType = Extract<
  SyncProtocolWithNetwork,
  { networkType: ConfigNetworkType.TEST }
>;

/** Primitives a TEST_PARALLEL chain emits (one per configured event in range). */
export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.TEST_PARALLEL
>;

export type Input = PageSyncRange<Page>;

export type Output = {
  raw: {
    timestamp: bigint;
    hash: string;
    blockNumber: number;
  };
  primitives: PrimitiveType[];
  blockHashes: string[];
};

export function toMsTimestamp(timestamp: bigint): TimestampMs {
  return Number(timestamp);
}
