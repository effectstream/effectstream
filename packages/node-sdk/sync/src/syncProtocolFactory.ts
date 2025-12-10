import { EvmSyncState } from "./sync-protocols/evm/state.ts";
import { EvmFetcher } from "./sync-protocols/evm/fetcher.ts";
import type { Operation } from "effection";
import type { PoolClient } from "pg";
import type { AllSyncProtocols } from "./sync-protocols/types.ts";
import { createViemPublicClient } from "@effectstream/utils";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  getViemNetwork,
} from "@effectstream/config";
import { CardanoSyncClient } from "@utxorpc/sdk";
import { BufferedRpc } from "./sync-protocols/utxorpc/BufferedRpc.ts";
import { UtxoRpcFetcher } from "./sync-protocols/utxorpc/fetcher.ts";
import { UtxoRpcSyncState } from "./sync-protocols/utxorpc/state.ts";
import { MidnightFetcher, MidnightSyncState } from "@effectstream/sync";
import { AvailFetcher } from "./sync-protocols/avail/fetcher.ts";
import { AvailSyncState } from "./sync-protocols/avail/state.ts";
import { NtpFetcher } from "./sync-protocols/ntp/fetcher.ts";
import { NtpSyncState } from "./sync-protocols/ntp/state.ts";
import {
  BitcoinFetcher,
  BitcoinRpcClient,
} from "./sync-protocols/bitcoin/fetcher.ts";
import { BitcoinSyncState } from "./sync-protocols/bitcoin/state.ts";

export function* genSyncProtocols(
  dbConn: PoolClient,
  syncInfo: SyncProtocolWithNetwork[],
): Operation<AllSyncProtocols[]> {
  const result: AllSyncProtocols[] = [];
  for (const entry of syncInfo) {
    if (entry.networkType === ConfigNetworkType.NTP) {
      const fetcher = new NtpFetcher(entry);
      const state = yield* NtpSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.EVM
    ) {
      const viemNetwork = yield* getViemNetwork(entry.network);
      const fetcher = new EvmFetcher(
        entry,
        createViemPublicClient(viemNetwork, {
          cacheTime: entry.syncProtocol.pollingInterval,
        }),
      );
      const state = yield* EvmSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.CARDANO
    ) {
      if (
        entry.syncProtocol.type === ConfigSyncProtocolType.CARDANO_CARP_PARALLEL
      ) {
        throw new Error("CARP not supported yet");
      }
      const client = new CardanoSyncClient({
        uri: entry.syncProtocol.rpcUrl,
      });
      const bufferedRpc = new BufferedRpc(
        client,
        entry.syncProtocol.confirmationDepth,
      );
      const fetcher = new UtxoRpcFetcher(
        entry,
        bufferedRpc,
      );
      const state = yield* UtxoRpcSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.MIDNIGHT
    ) {
      const fetcher = new MidnightFetcher(entry);
      const state = yield* MidnightSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.AVAIL
    ) {
      const fetcher = new AvailFetcher(entry);
      const state = yield* AvailSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.BITCOIN
    ) {
      const rpcClient = new BitcoinRpcClient({
        url: entry.network.rpcUrl,
        username: entry.network.rpcAuth?.username ?? null,
        password: entry.network.rpcAuth?.password ?? null,
      });
      const fetcher = new BitcoinFetcher(entry, rpcClient);
      const state = yield* BitcoinSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else {
      throw new Error(`Unsupported network type: ${entry.network.type}`);
    }
  }

  return result;
}
