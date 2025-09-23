import type { FlipObject } from "@paima/utils";
import { ConfigNetworkType } from "../network/mod.ts";
import type { ConfigSyncProtocolDecoratorType } from "./decorators/types.ts";
import type { NetworkConfig } from "../../config/parts/network.ts";
import type { ConfigSyncProtocolMapping } from "./all.ts";

export enum ConfigSyncProtocolType {
  NTP_MAIN = "ntp-main",
  EVM_RPC_PARALLEL = "evm-rpc-parallel",
  CARDANO_CARP_PARALLEL = "cardano-carp-parallel",
  CARDANO_UTXORPC_PARALLEL = "cardano-utxorpc-parallel",
  MINA_PARALLEL = "mina-sql-parallel",
  AVAIL_PARALLEL = "avail-rpc-parallel",
  MIDNIGHT_PARALLEL = "midnight-graphql-parallel",
}

export const SyncProtocolToNetwork = {
  [ConfigSyncProtocolType.NTP_MAIN]: ConfigNetworkType.NTP,
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: ConfigNetworkType.EVM,
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]: ConfigNetworkType.CARDANO,
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]: ConfigNetworkType.CARDANO,
  [ConfigSyncProtocolType.MINA_PARALLEL]: ConfigNetworkType.MINA,
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

export type DefaultPrimitive = {
  todo_this_should_be_defined_per_fetcher: string;
  abi: any;
  name: string;
  contractAddress: string;
};

export type PrimitiveEntry<
  SyncProtocol extends ConfigSyncProtocolType = ConfigSyncProtocolType,
> = {
  /** The sync protocol this primitive belongs to */
  syncProtocol: SyncProtocol;
  /** The primitive configuration */
  primitive: DefaultPrimitive;
  /** Custom identifier for the primitive */
  id: string;
};

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
    primitives: PrimitiveEntry<K>[];
  };
}[keyof typeof SyncProtocolToNetwork];
