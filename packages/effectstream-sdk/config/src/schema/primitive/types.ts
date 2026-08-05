import type {
  ConfigSyncProtocolType,
  ProtocolPrimitiveMap,
} from "../sync-protocols/types.ts";
import type { StateValue } from "@midnight-ntwrk/onchain-runtime";
import type { cardano } from '@utxorpc/spec';

export type { StateValue };

export type FlattenSyncProtocolIOFor<
  SyncProtocol extends keyof ProtocolPrimitiveMap,
> = {
  syncProtocol: {
    name: SyncProtocol;
    blockNumber: number;
    transactionHash: string;
    transactionIndex?: number;
    contractAddress: string;
    logIndex?: number;
    absoluteSlot?: number;
  };
  primitive: string;
  output: {
    payloadType: string;
    payload: ProtocolPayloadMap[SyncProtocol];
  };
};

type EVMPrimitivePayload = Record<string, any>;

type MidnightTPrimitivePayload = Record<string, any>;

type NtpPrimitivePayload = never;

type TestMainPrimitivePayload = never;
/** Arbitrary JSON payload declared per-event on a TEST_PARALLEL chain. */
type TestParallelPrimitivePayload = Record<string, unknown>;

type CardanoCarpPrimitivePayload = {
  TODO_MISSING_FIELDS: string;
};

type CardanoUtxoRpcPrimitivePayload = {
  tx: cardano.Tx;
};

type MinaPrimitivePayload = {
  TODO_MISSING_FIELDS: string;
};

type AvailPrimitivePayload = {
  inputData: string;
  inputNonce: string;
  suppliedValue: string;
};

type BitcoinPrimitivePayload = {
  direction: "input" | "output";
  address: string;
  transactionId: string;
  index: number;
  valueSats: number;
  utxo: {
    txid: string;
    vout: number;
  };
  label?: string;
};

type CelestiaPrimitivePayload = {
  /** Decoded blob data (UTF-8 string from base64) */
  suppliedValue: string;
  /** Hex-encoded Celestia namespace */
  namespace: string;
  /** Base64-encoded blob commitment hash */
  commitment: string;
  /** Index of the blob within the block */
  blobIndex: number;
};

type SolanaProgramLogPayload = {
  programId: string;
  slot: number;
  logMessages: string[];
};

type SolanaAccountBalancePayload = {
  address: string;
  lamports: number;
  slot: number;
};

type SolanaTokenBalancePayload = {
  tokenAccount: string;
  mint: string;
  /** Empty string when the RPC's balance record omitted the owner. */
  owner: string;
  /** Raw u64 in base units — a u64 does not survive a JS number. */
  amount: string;
  decimals: number;
  slot: number;
};

type SolanaPrimitivePayload =
  | SolanaProgramLogPayload
  | SolanaAccountBalancePayload
  | SolanaTokenBalancePayload;

interface ProtocolPayloadMap {
  [ConfigSyncProtocolType.NTP_MAIN]: NtpPrimitivePayload;
  [ConfigSyncProtocolType.EVM_RPC_PARALLEL]: EVMPrimitivePayload;
  [ConfigSyncProtocolType.CARDANO_CARP_PARALLEL]: CardanoCarpPrimitivePayload;
  [ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL]:
    CardanoUtxoRpcPrimitivePayload;
  [ConfigSyncProtocolType.MINA_PARALLEL]: MinaPrimitivePayload;
  [ConfigSyncProtocolType.AVAIL_PARALLEL]: AvailPrimitivePayload;
  [ConfigSyncProtocolType.MIDNIGHT_PARALLEL]: MidnightTPrimitivePayload;
  [ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL]: BitcoinPrimitivePayload;
  [ConfigSyncProtocolType.CELESTIA_PARALLEL]: CelestiaPrimitivePayload;
  [ConfigSyncProtocolType.SOLANA_RPC_PARALLEL]: SolanaPrimitivePayload;
  [ConfigSyncProtocolType.TEST_MAIN]: TestMainPrimitivePayload;
  [ConfigSyncProtocolType.TEST_PARALLEL]: TestParallelPrimitivePayload;
}
