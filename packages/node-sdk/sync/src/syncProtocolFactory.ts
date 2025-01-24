import { EvmSyncState } from "./sync-protocols/evm/state.ts";
import { EvmFetcher } from "./sync-protocols/evm/fetcher.ts";
import type { Operation } from "effection";
import type { PoolClient } from "pg";
import type { AllSyncProtocols } from "./sync-protocols/types.ts";
import { createViemPublicClient } from "@paima/utils";
import type { SyncProtocolWithNetwork } from "@paima/config";
import { ConfigNetworkType, getViemNetwork } from "@paima/config";

export function* genSyncProtocols(
  dbConn: PoolClient,
  syncInfo: SyncProtocolWithNetwork[],
): Operation<AllSyncProtocols[]> {
  const result: AllSyncProtocols[] = [];
  for (const entry of syncInfo) {
    if (
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
    } else {
      throw new Error(`Unsupported network type: ${entry.network.type}`);
    }
  }

  return result;
}
