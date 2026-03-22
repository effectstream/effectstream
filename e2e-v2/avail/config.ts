import { readAvailApplication } from "@e2e-v2/avail-contracts";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeAvailGeneric,
} from "@effectstream/sm/builtin";

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

// Read Avail application info (appId, applicationKey, genesisHash)
let availApp: ReturnType<typeof readAvailApplication> | undefined;
try {
  availApp = readAvailApplication();
} catch {
  // avail_app.json not yet created
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("e2e-v2-avail"),
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
        name: "availParallel",
        type: ConfigNetworkType.AVAIL,
        genesisSeed: "//Alice",
        caip2: "avail:local-dev",
        nodeUrl: "ws://localhost:9955/ws",
        genesisHash: availApp?.genesisHash ?? "",
      })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 500,
        }),
      )
      .addParallel(
        (networks) => (networks as any).availParallel,
        (network, deployments) => ({
          name: "parallelAvailRPC",
          type: ConfigSyncProtocolType.AVAIL_PARALLEL,
          rpc: "ws://localhost:9955/ws",
          lightClient: "http://localhost:7007",
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 60000,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelAvailRPC,
        (network, deployments, syncProtocol) => ({
          name: "AvailGenericData",
          type: PrimitiveTypeAvailGeneric,
          startBlockHeight: 0,
          appId: availApp?.appId ?? 0,
          applicationKey: availApp?.ApplicationKey ?? "",
          genesisHash: availApp?.genesisHash ?? "",
          stateMachinePrefix: "avail-app-state",
        }),
      )
  )
  .build();
