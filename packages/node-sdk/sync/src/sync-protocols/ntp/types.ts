import type {
  BlockNumber,
  NtpBlockHash,
  NtpBlockNumber,
  NtpPageJson,
  TimestampMs,
} from "@effectstream/utils";
import { TypeboxHelpers } from "@effectstream/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import { Type } from "@sinclair/typebox";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@effectstream/config";

export type Page = BlockNumber;
const PageJsonSchema = Type.Unsafe<
  NtpPageJson
>(Type.String());
export const PageSchema = TypeboxHelpers.SerializeObjAsJson<
  Page,
  typeof PageJsonSchema
>();

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.NTP_MAIN
>;
export type Input = PageSyncRange<Page>;
export type Output = {
  raw: {
    timestamp: bigint;
    hash: NtpBlockHash;
    blockNumber: number;
  };
  blockHashes: NtpBlockHash[];
};

export function toMsTimestamp(timestamp: bigint): TimestampMs {
  return Number(timestamp);
}
