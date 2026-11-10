import type {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  SyncProtocolWithNetwork,
} from "@effectstream/config";
import type { CkbBlockHash, CkbBlockNumber } from "@effectstream/utils";
import type { CkbCursor, CkbCellCreatedEventV1 } from "ckb-multichain-connector";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type { RootOutput, RootPage } from "../types.ts";

export type Page = { height: CkbBlockNumber; cursor?: CkbCursor };
export type Input = PageSyncRange<Page>;
export type ConfigType = Extract<SyncProtocolWithNetwork, { networkType: ConfigNetworkType.CKB }>;
export type PrimitiveType = FlattenSyncProtocolIOFor<ConfigSyncProtocolType.CKB_RPC_PARALLEL>;
export type Output = {
  raw: { height: CkbBlockNumber; timestamp: bigint; hash: CkbBlockHash };
  page: Page;
  primitives: PrimitiveType[];
  blockHashes: CkbBlockHash[];
};
export type { RootOutput, RootPage, CkbCellCreatedEventV1 };
