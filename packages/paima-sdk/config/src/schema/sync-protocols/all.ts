import {
  type TIntersect,
  type TLiteral,
  type TObject,
  type TSchema,
  type TString,
  Type,
} from "@sinclair/typebox";
import { ConfigSyncProtocolType } from "./types.ts";
import {
  CommonResponseEvmRpcMain,
  CommonResponseEvmRpcParallel,
  ConfigSyncProtocolSchemaEvmMain,
  ConfigSyncProtocolSchemaEvmParallel,
} from "./evm.ts";
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
} from "./mina.ts";
import {
  CommonResponseAvailRpcMain,
  CommonResponseAvailRpcParallel,
  ConfigSyncProtocolSchemaAvailMain,
  ConfigSyncProtocolSchemaAvailParallel,
} from "./avail.ts";
import {
  CommonResponseMidnightGraphqlParallel,
  ConfigSyncProtocolSchemaMidnightParallel,
} from "./midnight.ts";
import type { ToMapping } from "../utils.ts";
import { ConfigSyncProtocolDecorator } from "./decorators/all.ts";

export const mainSyncProtocolTypes = {
  [ConfigSyncProtocolType.EVM_RPC_MAIN]: ConfigSyncProtocolSchemaEvmMain,
  [ConfigSyncProtocolType.AVAIL_MAIN]: ConfigSyncProtocolSchemaAvailMain,
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
} as const;

export const syncProtocolCommonResponse = {
  [ConfigSyncProtocolType.EVM_RPC_MAIN]: CommonResponseEvmRpcMain,
  [ConfigSyncProtocolType.AVAIL_MAIN]: CommonResponseAvailRpcMain,
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: CommonResponseEvmRpcParallel,
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]:
    CommonResponseCardanoCarpParallel,
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]:
    CommonResponseCardanoUtxoRpcParallel,
  [ConfigSyncProtocolType.MINA_PARALLEL]: CommonResponseMinaDbParallel,
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: CommonResponseAvailRpcParallel,
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]:
    CommonResponseMidnightGraphqlParallel,
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
