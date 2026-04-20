import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeNEARAccountWatch,
  PrimitiveTypeNEARGeneric,
  PrimitiveTypeNEARIntent,
  PrimitiveTypeNEARNEP141,
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

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("e2e-v2-near"),
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
        name: "nearParallel",
        type: ConfigNetworkType.NEAR,
        rpcUrl: "http://localhost:3030",
        networkId: "localnet",
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
        (networks) => (networks as any).nearParallel,
        (network, deployments) => ({
          name: "parallelNearRPC",
          type: ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 2000,
          delayMs: 2400,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelNearRPC,
        (network, deployments, syncProtocol) => ({
          name: "NearGenericEvent",
          type: PrimitiveTypeNEARGeneric,
          startBlockHeight: 0,
          contractId: "test.near",
          eventStandard: "test",
          eventType: "test_event",
          scheduledPrefix: "near-generic",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelNearRPC,
        (network, deployments, syncProtocol) => ({
          name: "NearIntentSettlement",
          type: PrimitiveTypeNEARIntent,
          startBlockHeight: 0,
          contractId: "test.near",
          eventStandard: "dip4",
          eventType: "token_diff",
          scheduledPrefix: "intent-settled",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelNearRPC,
        (network, deployments, syncProtocol) => ({
          name: "NearAccountWatch",
          type: PrimitiveTypeNEARAccountWatch,
          startBlockHeight: 0,
          contractId: "test.near",
          scheduledPrefix: "near-account-watch",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelNearRPC,
        (network, deployments, syncProtocol) => ({
          name: "NearNep141Transfer",
          type: PrimitiveTypeNEARNEP141,
          startBlockHeight: 0,
          contractId: "test.near",
          eventStandard: "nep141",
          eventType: "ft_transfer",
          scheduledPrefix: "nep141-transfer",
        }),
      )
  )
  .build();
