import type { ConfigSyncProtocolType } from "../sync-protocols/types.ts";

export type FlattenSyncProtocolIOFor<
  SyncProtocol extends ConfigSyncProtocolType,
  PrimitivePayload = {},
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
    payload: PrimitivePayload;
  };
};
