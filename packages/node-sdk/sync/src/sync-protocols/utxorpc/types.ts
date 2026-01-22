import type {
  AbsoluteSlotNumber,
  BlockNumber,
  CardanoBlockHash,
  CardanoBlockNumber,
  TimestampMs,
} from "@effectstream/utils";
import type { PageRelation } from "../base/page.ts";
import type { cardano } from "@utxorpc/spec";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PrimitiveEntry,
  SyncProtocolWithNetwork,
} from "@effectstream/config";

// TODO: https://github.com/utxorpc/node-sdk/pull/38
export type ChainPoint = {
  slot: number | string;
  hash: string;
};

export type BlockAndTxs = {
  block: cardano.Block;
  txs: cardano.Tx[];
};

export type Page = {
  slot: AbsoluteSlotNumber;
  height: CardanoBlockNumber;
  hash: CardanoBlockHash;
};

export type PrimitiveEntryType = Extract<
  PrimitiveEntry,
  { syncProtocol: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL }
>;

// TODO: blocked on https://github.com/utxorpc/spec/issues/135
export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL
>;
export type Input = PageSyncRange<BlockNumber>;
export type Output = {
  raw: cardano.Block;
  primitives: PrimitiveType[];
  blockHashes: CardanoBlockHash[];
};

export const chainPointRelation: PageRelation<Page> = {
  compare: (p1, p2) => p1.slot - p2.slot,
  equals: (p1, p2) => p1.slot === p2.slot,
  min: (p1, p2) => (p1.slot < p2.slot ? p1 : p2),
  max: (p1, p2) => (p1.slot > p2.slot ? p1 : p2),
};

export type ConfigType = Extract<
  SyncProtocolWithNetwork,
  { syncProtocolType: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL }
>;