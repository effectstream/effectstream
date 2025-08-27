import type {
  AbsoluteSlotNumber,
  BlockNumber,
  CardanoBlockHash,
  CardanoBlockNumber,
  TimestampMs,
} from "@paima/utils";
import type { PageRelation } from "../base/page.ts";
import type { cardano } from "@utxorpc/spec";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";

/**
 * Cardano blocks don't contain an explicit timestamp
 * So we have to manage the mapping
 *
 * Note: this is no longer required if this is merged: https://github.com/utxorpc/spec/issues/150
 */
export type BlockAndTimestamp = {
  block: cardano.Block;
  timestamp: TimestampMs;
};

export type Page = {
  slot: AbsoluteSlotNumber;
  height: CardanoBlockNumber;
  hash: CardanoBlockHash;
};

// TODO: blocked on https://github.com/utxorpc/spec/issues/135
export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  ConfigPrimitiveType,
  ConfigPrimitivePayloadType
>;
export type Input = PageSyncRange<BlockNumber>;
export type Output = {
  raw: BlockAndTimestamp;
  primitives: PrimitiveType[];
  blockHashes: CardanoBlockHash[];
};

export const chainPointRelation: PageRelation<Page> = {
  compare: (p1, p2) => p1.slot - p2.slot,
  equals: (p1, p2) => p1.slot === p2.slot,
  min: (p1, p2) => (p1.slot < p2.slot ? p1 : p2),
  max: (p1, p2) => (p1.slot > p2.slot ? p1 : p2),
};
