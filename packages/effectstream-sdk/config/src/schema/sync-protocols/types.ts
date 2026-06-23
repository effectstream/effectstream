import type { FlipObject } from "@effectstream/utils";
import { ConfigNetworkType } from "../network/mod.ts";
import type { ConfigSyncProtocolDecoratorType } from "./decorators/types.ts";
import type { NetworkConfig } from "../../config/parts/network.ts";
import type { ConfigSyncProtocolMapping } from "./all.ts";
import type { UtxorpcTxPredicate, getEvmEvent } from "@effectstream/config";
import type { StateValue } from "@midnight-ntwrk/onchain-runtime"

export enum ConfigSyncProtocolType {
  NTP_MAIN = "ntp-main",
  EVM_RPC_PARALLEL = "evm-rpc-parallel",
  CARDANO_CARP_PARALLEL = "cardano-carp-parallel",
  CARDANO_UTXORPC_PARALLEL = "cardano-utxorpc-parallel",
  MINA_PARALLEL = "mina-sql-parallel",
  AVAIL_PARALLEL = "avail-rpc-parallel",
  MIDNIGHT_PARALLEL = "midnight-graphql-parallel",
  BITCOIN_RPC_PARALLEL = "bitcoin-rpc-parallel",
  CELESTIA_PARALLEL = "celestia-rpc-parallel",
  NEAR_RPC_PARALLEL = "near-rpc-parallel",
  SOLANA_RPC_PARALLEL = "solana-rpc-parallel",
}

export const SyncProtocolToNetwork = {
  [ConfigSyncProtocolType.NTP_MAIN]: ConfigNetworkType.NTP,
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: ConfigNetworkType.EVM,
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]: ConfigNetworkType.CARDANO,
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]: ConfigNetworkType.CARDANO,
  [ConfigSyncProtocolType.MINA_PARALLEL]: ConfigNetworkType.MINA,
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: ConfigNetworkType.AVAIL,
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]: ConfigNetworkType.MIDNIGHT,
  [ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL]: ConfigNetworkType.BITCOIN,
  [ConfigSyncProtocolType.CELESTIA_PARALLEL]: ConfigNetworkType.CELESTIA,
  [ConfigSyncProtocolType.NEAR_RPC_PARALLEL]: ConfigNetworkType.NEAR,
  [ConfigSyncProtocolType.SOLANA_RPC_PARALLEL]: ConfigNetworkType.SOLANA,
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
  type: `${string}:${string}`;
  startBlockHeight: number;
  scheduledPrefix?: string;
  /** When true, fetcher returns block info for ALL blocks in range, not just those with primitives. Default: false */
  getAllBlockHeaders?: boolean;
};

type EVMPrimitive = BasePrimitive & {
  abi: ReturnType<typeof getEvmEvent> | ReturnType<typeof getEvmEvent>[];
  contractAddress: string;
};

export type LedgerPrimitiveType =
  | "uint8"
  | "uint16"
  | "uint32"
  | "uint64"
  | "uint128"
  | "bytes"
  | "boolean";

export type LedgerFieldType =
  | LedgerPrimitiveType
  | { type: "map"; value: LedgerFieldType }
  | { type: "option"; value: LedgerFieldType };

/**
 * Maps ledger field names (in Compact declaration order) to their types.
 * The parser accesses state array positions by key insertion order.
 */
export type LedgerSchema = Record<string, LedgerFieldType>;

type MidnightPrimitive = BasePrimitive & {
  contractAddress?: string;
  contract?: {
    ledger: (data: StateValue) => Record<string, any>;
  };
  /**
   * Parses ledger fields defined in `ledgerSchema` from the raw Midnight StateValue.
   * Present only when the primitive is constructed with a `ledgerSchema`.
   */
  parseAdditionalLedgerFields?: (stateValue: StateValue) => Record<string, any>;
  networkId?: string;
  genesisHash?: string;
};

type CardanoUtxoRpcPrimitive = BasePrimitive & {
  predicate: UtxorpcTxPredicate;
};

type CardanoCarpPrimitive = BasePrimitive & {
  TODO_ADD_MISSING_FIELDS: string;
};

type MinaPrimitive = BasePrimitive & {
  TODO_ADD_MISSING_FIELDS: string;
};

type AvailPrimitive = BasePrimitive & {
  appId: number; // readAvailApplication().appId,
  applicationKey: string; // readAvailApplication().ApplicationKey,
  genesisHash: string; // readAvailApplication().genesisHash,
};

type CelestiaPrimitive = BasePrimitive & {
  /**
   * The Celestia namespace to watch for blobs, as a hex string.
   * Example: "000000000000deadbeef"
   */
  namespace: string;
};

type NearPrimitive = BasePrimitive & {  /** NEAR account ID of the contract to watch (e.g., "intents.near") */
  contractId: string;
  /** NEP-297 event standard field filter (e.g., "nep141", "dip4") */
  eventStandard?: string;
  /** NEP-297 event type field filter (e.g., "ft_transfer", "token_diff") */
  eventType?: string;
  /** Glob patterns for intent token ID filtering (e.g., ["nep245:game.near:*"]) */
  filterTokenIds?: string[];
  /** Glob patterns for account ID filtering (e.g., ["*.game.near"]) */
  filterAccountIds?: string[];
};

type NtpMainPrimitive = BasePrimitive & {};

type SolanaPrimitive = BasePrimitive & {
  /** Program ID to watch for logs (SOLANA:ProgramLog primitive). */
  programId?: string;
  /** Optional event type label used to filter log lines. */
  eventType?: string;
  /** Account address to watch for balance changes (SOLANA:AccountBalance primitive). */
  address?: string;
}

export type BitcoinPrimitiveDirection = "inputs" | "outputs" | "both";

type BitcoinPrimitive = BasePrimitive & {
  /**
   * The address to watch for transactions. Must be a fixed address, for now multi address wallets are not supported.
   */
  watchAddress: string;
  /**
   * Allows narrowing notifications to only creations or spends.
   * Defaults to `both`.
   */
  direction?: BitcoinPrimitiveDirection;
  /**
   * Optional human label for this address (e.g. exchange name).
   */
  label?: string;
};

/**
 * A mapping between specific sync protocols and their corresponding primitive types.
 * This helps in creating a discriminated union for PrimitiveEntry.
 */
export type ProtocolPrimitiveMap = {
  [ConfigSyncProtocolType.NTP_MAIN]: NtpMainPrimitive;
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: EVMPrimitive;
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]: MidnightPrimitive;
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]: CardanoCarpPrimitive;
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]: CardanoUtxoRpcPrimitive;
  [ConfigSyncProtocolType.MINA_PARALLEL]: MinaPrimitive;
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: AvailPrimitive;
  [ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL]: BitcoinPrimitive;
  [ConfigSyncProtocolType.CELESTIA_PARALLEL]: CelestiaPrimitive;
  [ConfigSyncProtocolType.NEAR_RPC_PARALLEL]: NearPrimitive;
  [ConfigSyncProtocolType.SOLANA_RPC_PARALLEL]: SolanaPrimitive;
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
