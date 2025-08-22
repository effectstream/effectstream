import type {
  BlockNumber,
  NtpBlockHash,
  NtpPageJson,
  TimestampMs,
} from "@paima/utils";
import { TypeboxHelpers } from "@paima/utils";
import type { PageSyncRange } from "../common/page-helpers.ts";
import { Type } from "@sinclair/typebox";
import type {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";

export type Page = BlockNumber;
const PageJsonSchema = Type.Unsafe<
  NtpPageJson
>(Type.String());
export const PageSchema = TypeboxHelpers.SerializeObjAsJson<
  Page,
  typeof PageJsonSchema
>();

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.NTP_MAIN,
  ConfigPrimitiveType,
  ConfigPrimitivePayloadType
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
