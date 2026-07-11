import {
  type Static,
  type TIntersect,
  type TLiteral,
  type TObject,
  type TSchema,
  type TString,
  Type,
} from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "./types.ts";
import {
  CommonResponseEvmRpcParallel,
  ConfigSyncProtocolSchemaEvmParallel,
} from "./evm/rpc.ts";
import {
  CommonResponseCardanoCarpParallel,
  ConfigSyncProtocolSchemaCardanoCarpParallel,
} from "./cardano/carp.ts";
import {
  CommonResponseCardanoUtxoRpcParallel,
  ConfigSyncProtocolSchemaCardanoUtxoRpcParallel,
} from "./cardano/utxorpc.ts";
import {
  CommonResponseMinaDbParallel,
  ConfigSyncProtocolSchemaMinaParallel,
} from "./mina/graphql.ts";
import {
  CommonResponseAvailRpcParallel,
  ConfigSyncProtocolSchemaAvailParallel,
} from "./avail/rpc.ts";
import {
  CommonResponseMidnightGraphqlParallel,
  ConfigSyncProtocolSchemaMidnightParallel,
} from "./midnight/graphql.ts";
import {
  CommonResponseBitcoinRpcParallel,
  ConfigSyncProtocolSchemaBitcoinParallel,
} from "./bitcoin/rpc.ts";
import {
  CommonResponseCelestiaRpcParallel,
  ConfigSyncProtocolSchemaCelestiaParallel,
} from "./celestia/rpc.ts";
import {
  CommonResponseNearRpcParallel,
  ConfigSyncProtocolSchemaNearParallel,
} from "./near/rpc.ts";
import {
  CommonResponseSolanaRpcParallel,
  ConfigSyncProtocolSchemaSolanaParallel,
} from "./solana/rpc.ts";
import type { ToMapping } from "../utils.ts";
import { ConfigSyncProtocolDecorator } from "./decorators/all.ts";
import {
  CommonResponseNtpMain,
  ConfigSyncProtocolSchemaNtpMain,
} from "./ntp/rpc.ts";
import {
  CommonResponseTestMain,
  CommonResponseTestParallel,
  ConfigSyncProtocolSchemaTestMain,
  ConfigSyncProtocolSchemaTestParallel,
} from "./test/rpc.ts";

export const mainSyncProtocolTypes = {
  [ConfigSyncProtocolType.NTP_MAIN]: ConfigSyncProtocolSchemaNtpMain,
  [ConfigSyncProtocolType.TEST_MAIN]: ConfigSyncProtocolSchemaTestMain,
} as const;

export type ConfigSyncProtocolMappingMain = ToMapping<
  ConfigSyncProtocolType,
  typeof mainSyncProtocolTypes
>;

export const parallelSyncProtocolTypes = {
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]:
    ConfigSyncProtocolSchemaEvmParallel,
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]:
    ConfigSyncProtocolSchemaCardanoCarpParallel,
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]:
    ConfigSyncProtocolSchemaCardanoUtxoRpcParallel,
  [ConfigSyncProtocolType.MINA_PARALLEL]: ConfigSyncProtocolSchemaMinaParallel,
  [ConfigSyncProtocolType.AVAIL_PARALLEL]:
    ConfigSyncProtocolSchemaAvailParallel,
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]:
    ConfigSyncProtocolSchemaMidnightParallel,
  [ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL]:
    ConfigSyncProtocolSchemaBitcoinParallel,
  [ConfigSyncProtocolType.CELESTIA_PARALLEL]:
    ConfigSyncProtocolSchemaCelestiaParallel,
  [ConfigSyncProtocolType.NEAR_RPC_PARALLEL]:
    ConfigSyncProtocolSchemaNearParallel,
  [ConfigSyncProtocolType.SOLANA_RPC_PARALLEL]:
    ConfigSyncProtocolSchemaSolanaParallel,
  [ConfigSyncProtocolType.TEST_PARALLEL]:
    ConfigSyncProtocolSchemaTestParallel,
} as const;

export const syncProtocolCommonResponse = {
  [ConfigSyncProtocolType.NTP_MAIN]: CommonResponseNtpMain,
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: CommonResponseEvmRpcParallel,
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]:
    CommonResponseCardanoCarpParallel,
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]:
    CommonResponseCardanoUtxoRpcParallel,
  [ConfigSyncProtocolType.MINA_PARALLEL]: CommonResponseMinaDbParallel,
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: CommonResponseAvailRpcParallel,
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]:
    CommonResponseMidnightGraphqlParallel,
  [ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL]:
    CommonResponseBitcoinRpcParallel,
  [ConfigSyncProtocolType.CELESTIA_PARALLEL]:
    CommonResponseCelestiaRpcParallel,
  [ConfigSyncProtocolType.NEAR_RPC_PARALLEL]:
    CommonResponseNearRpcParallel,
  [ConfigSyncProtocolType.SOLANA_RPC_PARALLEL]:
    CommonResponseSolanaRpcParallel,
  [ConfigSyncProtocolType.TEST_MAIN]: CommonResponseTestMain,
  [ConfigSyncProtocolType.TEST_PARALLEL]: CommonResponseTestParallel,
} as const satisfies Record<ConfigSyncProtocolType, TSchema>;
export type ConfigSyncProtocolCommonAll = typeof syncProtocolCommonResponse;

function genConfigSyncProtocolCommon<
  const T extends ConfigSyncProtocolType,
  const Fields extends TObject,
>(
  type: T,
  base: Fields,
): TIntersect<[Fields, TObject<{ name: TString; type: TLiteral<T> }>]> {
  return Type.Intersect([
    base,
    Type.Object({ name: Type.String(), type: Type.Literal(type) }),
  ]) as any;
}
export const ConfigSyncProtocolCommonResponseAll: {
  [K in keyof ConfigSyncProtocolCommonAll]: ReturnType<
    typeof genConfigSyncProtocolCommon<K, ConfigSyncProtocolCommonAll[K]>
  >;
} = Object.entries(syncProtocolCommonResponse).map(([key, schema]) =>
  genConfigSyncProtocolCommon(key as ConfigSyncProtocolType, schema)
) as any;
export type ConfigSyncProtocolMappingParallel = ToMapping<
  ConfigSyncProtocolType,
  typeof parallelSyncProtocolTypes
>;

export type ConfigSyncProtocolMapping =
  & ConfigSyncProtocolMappingMain
  & ConfigSyncProtocolMappingParallel;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const ConfigSyncProtocolMain = <Bool extends boolean>(
  requireOptional: Bool,
) =>
  Type.Union(
    Object.values(mainSyncProtocolTypes).map((schema) =>
      schema.allProperties(requireOptional)
    ),
  );
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const ConfigSyncProtocolParallel = <Bool extends boolean>(
  requireOptional: Bool,
) =>
  Type.Union(
    Object.values(parallelSyncProtocolTypes).map((schema) =>
      schema.allProperties(requireOptional)
    ),
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const ConfigSyncProtocolAll = <Bool extends boolean>(
  requireOptional: Bool,
) =>
  Type.Union([
    ConfigSyncProtocolMain(requireOptional),
    ConfigSyncProtocolParallel(requireOptional),
    ConfigSyncProtocolDecorator(requireOptional),
  ]);

export function getMainchainInfo<
  T extends keyof typeof ConfigSyncProtocolCommonResponseAll,
>(
  payload: Static<typeof ConfigSyncProtocolCommonResponseAll[T]>,
) {
  return "mainchain" in payload.payload
    ? payload.payload.mainchain
    : payload.payload.ownChain;
}
