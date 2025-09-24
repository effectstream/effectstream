import type { FlipObject } from "@paima/utils";
import { ConfigNetworkType } from "../network/mod.ts";
import type { ConfigSyncProtocolDecoratorType } from "./decorators/types.ts";
import type { NetworkConfig } from "../../config/parts/network.ts";
import type { ConfigSyncProtocolMapping } from "./all.ts";
import type { getEvmEvent } from "@paima/config";

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

type BasePrimitive = {
  name: string;
  type: string;
  startBlockHeight: number;
};

type EVMPrimitive = BasePrimitive & {
  abi: ReturnType<typeof getEvmEvent>;
  contractAddress: string;
  scheduledPrefix?: string;
};

type MidnightPrimitive = BasePrimitive & {
  name: string;
  contractAddress: string;
  scheduledPrefix?: string;
};

type CardanoUtxoRpcPrimitive = BasePrimitive & {
  TODO_ADD_MISSING_FIELDS: string;
};

type CardanoCarpPrimitive = BasePrimitive & {
  TODO_ADD_MISSING_FIELDS: string;
};

type MinaPrimitive = BasePrimitive & {
  TODO_ADD_MISSING_FIELDS: string;
};

type AvailPrimitive = BasePrimitive & {
  TODO_ADD_MISSING_FIELDS: string;
};

/**
 * A mapping between specific sync protocols and their corresponding primitive types.
 * This helps in creating a discriminated union for PrimitiveEntry.
 */
export type ProtocolPrimitiveMap = {
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: EVMPrimitive;
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]: MidnightPrimitive;
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]: CardanoCarpPrimitive;
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]: CardanoUtxoRpcPrimitive;
  [ConfigSyncProtocolType.MINA_PARALLEL]: MinaPrimitive;
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: AvailPrimitive;
};

/**
 * PrimitiveEntry contains the sync protocol name,
 * and the primitive configuration created by `getConfig()`
 */
export type PrimitiveEntry = {
  [K in ConfigSyncProtocolType]: {
    /** The sync protocol this primitive belongs to */
    syncProtocol: K;
    /**
     * The primitive configuration, correctly typed based on the syncProtocol.
     * Protocols not in ProtocolPrimitiveMap will default to DefaultPrimitive.
     */
    primitive: K extends keyof ProtocolPrimitiveMap ? ProtocolPrimitiveMap[K]
      : never;
    /** Custom identifier for the primitive */
    id: string;
  };
}[ConfigSyncProtocolType];

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
    primitives: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolMapping[K]["type"] }
    >[];
  };
}[keyof typeof SyncProtocolToNetwork];
