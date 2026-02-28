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
}
