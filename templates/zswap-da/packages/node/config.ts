
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeCelestiaGeneric,
  PrimitiveTypeMidnightGeneric,
} from "@effectstream/sm/builtin";
import type { BlockNumber } from "@effectstream/utils";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { OfferFilesContract } from "../midnight-contracts/contract-offer-files/src/index.ts";

import { getEnv } from "@effectstream/utils/runtime";

export const CELESTIA_RPC_URL = getEnv("CELESTIA_RPC_URL") ?? "http://127.0.0.1:26658";
export const CELESTIA_NAMESPACE = getEnv("CELESTIA_NAMESPACE") ?? "000000000000deadbeef";
export const CELESTIA_FEE = parseInt(getEnv("CELESTIA_FEE") ?? "2000");
export const CELESTIA_GAS_LIMIT = parseInt(getEnv("CELESTIA_GAS_LIMIT") ?? "100000");


export const midnightContract = (() => {
  try {
    return readMidnightContract("contract-offer-files", {
      baseDir: new URL("../midnight-contracts/", import.meta.url).pathname,
      networkId: midnightNetworkConfig.id,
    });
  } catch (error) {
    console.error("[Midnight contract read error]", error);
    return null;
  }
})();

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("zswap-da-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime() - 11082*1000,
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: midnightNetworkConfig.id,
        nodeUrl: midnightNetworkConfig.node,
      })
      .addNetwork({
        name: "celestia",
        type: ConfigNetworkType.CELESTIA,
        rpcUrl: CELESTIA_RPC_URL,
      })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (_network, _deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).midnight,
        (_network, _deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 18000,
          indexer: midnightNetworkConfig.indexer,
          indexerWs: midnightNetworkConfig.indexerWS,
        }),
      )
      .addParallel(
        (networks) => (networks as any).celestia,
        (_network, _deployments) => ({
          name: "parallelCelestia",
          type: ConfigSyncProtocolType.CELESTIA_PARALLEL,
          startBlockHeight: 1 as BlockNumber,
          // Celestia block time is ~12s; poll every 6s and wait 1 block for safety
          pollingInterval: 6_000,
          delayMs: 12_000,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) => {
    let b = builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelCelestia,
      (_network, _deployments, _syncProtocol) => ({
        name: "ZswapBlob",
        type: PrimitiveTypeCelestiaGeneric,
        startBlockHeight: 1,
        namespace: CELESTIA_NAMESPACE,
        stateMachinePrefix: "celestia-zswap",
      }),
    );

    if (midnightContract) {
      b = b.addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        (_network, _deployments, _syncProtocol) => ({
          name: "ZswapMidnightState",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: midnightContract.contractAddress,
          stateMachinePrefix: "midnight-zswap",
          contract: { ledger: OfferFilesContract.ledger },
          networkId: midnightNetworkConfig.id,
        }),
      );
    }
    return b;
  })
  .build();
