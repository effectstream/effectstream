import type {
  BlockNumber,
  EvmBlockHash,
  EvmRpcPageJson,
  TimestampMs,
} from "@paima/utils";
import { TypeboxHelpers } from "@paima/utils";
import type { Chain, GetBlockReturnType } from "viem";
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
  EvmRpcPageJson
>(Type.String());
export const PageSchema = TypeboxHelpers.SerializeObjAsJson<
  Page,
  typeof PageJsonSchema
>();

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.EVM_RPC_MAIN | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ConfigPrimitiveType,
  ConfigPrimitivePayloadType
>;
export type Input = PageSyncRange<Page>;
export type Output = {
  raw: GetBlockReturnType<Chain>;
  primitives: PrimitiveType[];
  blockHashes: EvmBlockHash[];
};

/**
 * recall: EVM blocks use second resolution, but we want ms resolution
 */
export function toMsTimestamp(timestamp: bigint): TimestampMs {
  return Number(timestamp) * 1000;
}
