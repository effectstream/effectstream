import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeCelestiaGeneric,
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeMidnightNullifier,
} from "@effectstream/sm/builtin";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { OfferFilesContract } from "@zswap-da/contract-offer-files";
import { getEnv } from "@effectstream/utils/runtime";
import { getConnection } from "@effectstream/db";

const CELESTIA_NAMESPACE = "000000000000deadbeef";
const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

if (typeof process !== "undefined") {
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
}

const offerFilesContract = (() => {
  try {
    return readMidnightContract("contract-offer-files", {
      baseDir: new URL("../packages/midnight-contracts/", import.meta.url).pathname,
      networkId: midnightNetworkConfig.id,
    });
  } catch (error) {
    console.error("[E2E Config] Midnight contract read error:", error);
    return null;
  }
})();

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("e2e-v2-zswap-da"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? Date.now(),
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
        rpcUrl: "http://localhost:26658",
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
          pollingInterval: 500,
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
          pollingInterval: 6000,
          delayMs: 12000,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) => {
    let b = builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelCelestia,
      () => ({
        name: "ZswapBlob",
        type: PrimitiveTypeCelestiaGeneric,
        startBlockHeight: 1,
        namespace: CELESTIA_NAMESPACE,
        stateMachinePrefix: "celestia-zswap",
      }),
    );

    if (offerFilesContract) {
      b = b.addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        () => ({
          name: "ZswapMidnightState",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: offerFilesContract.contractAddress,
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
      );
    }

    return b;
  })
  .build();
