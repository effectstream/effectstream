import type {
  AbsoluteSlotNumber,
  CardanoBlockHash,
  TimestampMs,
} from "@paima/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import type { cardano } from "@utxorpc/spec";

// based on ChainPoint from `@utxorpc/sdk`
export type Page = {
  slot: AbsoluteSlotNumber;
  hash: CardanoBlockHash;
};
// TODO: blocked on https://github.com/utxorpc/spec/issues/135
export type PrimitiveType = {
  value: number;
  block: cardano.Block;
  timestamp: TimestampMs;
};
export type Input = PageSyncRange<Page>;
export type Output = {
  raw: cardano.Block;
  primitives: PrimitiveType[];
};

export const chainPointRelation: PageRelation<Page> = {
  compare: (p1, p2) => p1.slot - p2.slot,
  equals: (p1, p2) => p1.slot === p2.slot,
  min: (p1, p2) => (p1.slot < p2.slot ? p1 : p2),
  max: (p1, p2) => (p1.slot > p2.slot ? p1 : p2),
};
