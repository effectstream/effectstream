import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeCelestiaGeneric,
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeMidnightNullifier,
  PrimitiveTypeMidnightUnshieldedSpend,
} from "@effectstream/sm/builtin";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { OfferFilesContract } from "@zswap-da/contract-offer-files";
import { getConnection } from "@effectstream/db";

import {
  CELESTIA_NAMESPACE,
  CELESTIA_POLLING_INTERVAL_MS,
  CELESTIA_RPC_URL,
  midnightContract,
} from "./env.ts";

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

const dbConn = getConnection();
try {
  const result = await dbConn.query(`
    SELECT * FROM effectstream.sync_protocol_pagination
    WHERE protocol_name = '${mainSyncProtocolName}'
    ORDER BY page_number ASC
    LIMIT 1
  `);
  if (!result || !result.rows.length) {
    throw new Error("DB is empty");
  }
  launchStartTime = result.rows[0].page.root -
    (result.rows[0].page_number * 1000);
} catch {
  // DB not initialized yet
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("zswap-da-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
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
        () => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).midnight,
        () => ({
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
        () => ({
          name: "parallelCelestia",
          type: ConfigSyncProtocolType.CELESTIA_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: CELESTIA_POLLING_INTERVAL_MS,
          delayMs: 12_000,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) => {
    return builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelCelestia,
      () => ({
        name: "ZswapBlob",
        type: PrimitiveTypeCelestiaGeneric,
        startBlockHeight: 1,
        namespace: CELESTIA_NAMESPACE,
        stateMachinePrefix: "celestia-zswap",
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      () => ({
        name: "ZswapMidnightState",
        type: PrimitiveTypeMidnightGeneric,
        startBlockHeight: 1,
        contractAddress: midnightContract!.contractAddress,
        stateMachinePrefix: "midnight-zswap",
        contract: { ledger: OfferFilesContract.ledger },
        networkId: midnightNetworkConfig.id,
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      () => ({
        name: "Midnight-Nullifier",
        type: PrimitiveTypeMidnightNullifier,
        startBlockHeight: 1,
        stateMachinePrefix: "midnight-nullifier",
        networkId: midnightNetworkConfig.id,
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      () => ({
        name: "Midnight-UnshieldedSpend",
        type: PrimitiveTypeMidnightUnshieldedSpend,
        startBlockHeight: 1,
        stateMachinePrefix: "midnight-unshielded-spend",
        networkId: midnightNetworkConfig.id,
      }),
    );
  })
  .build();
