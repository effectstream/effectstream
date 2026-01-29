import type {
  ConfigSyncProtocolType,
  ProtocolPrimitiveMap,
} from "../sync-protocols/types.ts";
import type { EncodedStateValue } from "@midnight-ntwrk/onchain-runtime";
import type { cardano } from '@utxorpc/spec';

export type { EncodedStateValue };

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

type MidnightTPrimitivePayload = EncodedStateValue;

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
}
