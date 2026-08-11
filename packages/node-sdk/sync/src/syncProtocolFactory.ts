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
import { WatchMultiplexer } from "./sync-protocols/utxorpc/WatchMultiplexer.ts";
import { UtxoRpcFetcher } from "./sync-protocols/utxorpc/fetcher.ts";
import { UtxoRpcSyncState } from "./sync-protocols/utxorpc/state.ts";
import { isEffectiveServerPredicate, predicateKey } from "./sync-protocols/utxorpc/utils.ts";
import type { UtxorpcTxPredicate } from "@effectstream/config";
import type { PrimitiveEntryType } from "./sync-protocols/utxorpc/types.ts";
import { MidnightFetcher } from "./sync-protocols/midnight/fetcher.ts";
import { MidnightSyncState } from "./sync-protocols/midnight/state.ts";
import { AvailFetcher } from "./sync-protocols/avail/fetcher.ts";
import { AvailSyncState } from "./sync-protocols/avail/state.ts";
import { NtpFetcher } from "./sync-protocols/ntp/fetcher.ts";
import { NtpSyncState } from "./sync-protocols/ntp/state.ts";
import {
  BitcoinFetcher,
  BitcoinRpcClient,
} from "./sync-protocols/bitcoin/fetcher.ts";
import { BitcoinSyncState } from "./sync-protocols/bitcoin/state.ts";
import { CelestiaFetcher } from "./sync-protocols/celestia/fetcher.ts";
import { CelestiaSyncState } from "./sync-protocols/celestia/state.ts";
import { NearFetcher } from "./sync-protocols/near/fetcher.ts";
import { NearSyncState } from "./sync-protocols/near/state.ts";
import { SolanaFetcher } from "./sync-protocols/solana/fetcher.ts";
import { SolanaSyncState } from "./sync-protocols/solana/state.ts";
import { TestFetcher } from "./sync-protocols/test/fetcher.ts";
import { TestSyncState } from "./sync-protocols/test/state.ts";
import { requestTimeoutOf } from "./sync-protocols/common/http.ts";

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
          timeout: requestTimeoutOf(entry.syncProtocol),
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
        entry.syncProtocolType === ConfigSyncProtocolType.CARDANO_CARP_PARALLEL
      ) {
        throw new Error("CARP not supported yet");
      }
      const clientOptions = {
        uri: entry.syncProtocol.rpcUrl,
        headers: entry.syncProtocol.headers,
      };
      const syncClient = new CardanoSyncClient(clientOptions);
      const primitivesByPredicate = groupPrimitivesByPredicate(
        entry.primitives as PrimitiveEntryType[],
      );
      const multiplexer = new WatchMultiplexer(
        clientOptions,
        primitivesByPredicate,
        entry.syncProtocol.confirmationDepth,
        syncClient,
      );
      const fetcher = new UtxoRpcFetcher(
        entry,
        multiplexer,
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
        requestTimeoutMs: requestTimeoutOf(entry.syncProtocol),
      });
      const fetcher = new BitcoinFetcher(entry, rpcClient);
      const state = yield* BitcoinSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.CELESTIA
    ) {
      const fetcher = new CelestiaFetcher(entry);
      const state = yield* CelestiaSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.NEAR
    ) {
      const fetcher = new NearFetcher(entry);
      const state = yield* NearSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.SOLANA
    ) {
      const fetcher = new SolanaFetcher(entry);
      const state = yield* SolanaSyncState.restoreState(
        dbConn,
        entry,
        fetcher,
      );
      result.push(state);
    } else if (
      entry.networkType === ConfigNetworkType.TEST
    ) {
      // Synthetic test chain (TEST_MAIN clock or TEST_PARALLEL source).
      const fetcher = new TestFetcher(entry);
      const state = yield* TestSyncState.restoreState(
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

function groupPrimitivesByPredicate(
  primitives: PrimitiveEntryType[],
): Map<string, { predicate: UtxorpcTxPredicate; primitiveEntries: PrimitiveEntryType[] }> {
  const groups = new Map<string, { predicate: UtxorpcTxPredicate; primitiveEntries: PrimitiveEntryType[] }>();
  const emptyKey = predicateKey({});

  for (const entry of primitives) {
    const predicate = entry.primitive.predicate;
    // TODO(dolos): when Dolos implements has_certificate, remove this fallback to empty predicate
    const effective = isEffectiveServerPredicate(predicate);
    const key = effective ? predicateKey(predicate) : emptyKey;
    const effectivePredicate = effective ? predicate : {};

    let group = groups.get(key);
    if (!group) {
      group = { predicate: effectivePredicate, primitiveEntries: [] };
      groups.set(key, group);
    }
    group.primitiveEntries.push(entry);
  }

  return groups;
}
