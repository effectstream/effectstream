import type {
  BlockNumber,
  EvmBlockHash,
  EvmRpcPageJson,
  TimestampMs,
} from "@effectstream/utils";
import { TypeboxHelpers } from "@effectstream/utils";
import type { Chain, GetBlockReturnType } from "viem";
import type { PageSyncRange } from "../common/page-helpers.ts";
import { Type } from "@sinclair/typebox";
import type {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PrimitiveEntry,
  SyncProtocolWithNetwork,
} from "@effectstream/config";

export type Page = BlockNumber;
const PageJsonSchema = Type.Unsafe<
  EvmRpcPageJson
>(Type.String());
export const PageSchema = TypeboxHelpers.SerializeObjAsJson<
  Page,
  typeof PageJsonSchema
>();

export type ConfigType = Extract<
  SyncProtocolWithNetwork,
  { networkType: ConfigNetworkType.EVM }
>;

export type PrimitiveEntryType = Extract<
  PrimitiveEntry,
  { syncProtocol: ConfigSyncProtocolType.EVM_RPC_PARALLEL }
>;

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL
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
