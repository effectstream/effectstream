import type { FlipObject } from "@paima/utils";
import { ConfigNetworkType } from "../network/mod.ts";
import type { ConfigSyncProtocolDecoratorType } from "./decorators/types.ts";
import type { NetworkConfig } from "../../config/parts/network.ts";
import type { ConfigSyncProtocolMapping } from "./all.ts";

export enum ConfigSyncProtocolType {
  EVM_RPC_MAIN = "evm-rpc-main",
  EVM_RPC_PARALLEL = "evm-rpc-parallel",
  CARDANO_CARP_PARALLEL = "cardano-carp-parallel",
  CARDANO_UTXORPC_PARALLEL = "cardano-utxorpc-parallel",
  MINA_PARALLEL = "mina-sql-parallel",
  AVAIL_MAIN = "avail-rpc-main",
  AVAIL_PARALLEL = "avail-rpc-parallel",
  MIDNIGHT_PARALLEL = "midnight-graphql-parallel",
}

export const SyncProtocolToNetwork = {
  [ConfigSyncProtocolType.EVM_RPC_MAIN]: ConfigNetworkType.EVM,
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: ConfigNetworkType.EVM,
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]: ConfigNetworkType.CARDANO,
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]: ConfigNetworkType.CARDANO,
  [ConfigSyncProtocolType.MINA_PARALLEL]: ConfigNetworkType.MINA,
  [ConfigSyncProtocolType.AVAIL_MAIN]: ConfigNetworkType.AVAIL,
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: ConfigNetworkType.AVAIL,
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]: ConfigNetworkType.MIDNIGHT,
} satisfies Record<ConfigSyncProtocolType, ConfigNetworkType>;

export type NetworkTypeFromSyncProtocol<T extends ConfigSyncProtocolType> =
  (typeof SyncProtocolToNetwork)[T];
export type SyncProtocolFromNetwork<T extends ConfigNetworkType> =
  FlipObject<typeof SyncProtocolToNetwork> extends
    Partial<Record<ConfigNetworkType, ConfigSyncProtocolType>>
    ? FlipObject<typeof SyncProtocolToNetwork>[T]
    : never;

export type NetworkFromSyncProtocol<
  T extends ConfigSyncProtocolType | ConfigSyncProtocolDecoratorType,
> = T extends ConfigSyncProtocolType
  ? Extract<NetworkConfig, { type: NetworkTypeFromSyncProtocol<T> }>
  : undefined;

export type SyncProtocolWithNetwork = {
  [K in keyof typeof SyncProtocolToNetwork]: {
    networkType: NetworkFromSyncProtocol<K>["type"];
    syncProtocolType: ConfigSyncProtocolMapping[K]["type"];
    syncProtocol: ConfigSyncProtocolMapping[K];
    network: NetworkFromSyncProtocol<K>;
  };
}[keyof typeof SyncProtocolToNetwork];
