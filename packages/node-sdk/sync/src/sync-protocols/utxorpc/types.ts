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

import type { CardanoChainPoint } from "@utxorpc/sdk";
export type ChainPoint = CardanoChainPoint;

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