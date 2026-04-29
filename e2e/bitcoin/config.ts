import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import type { BlockNumber } from "@effectstream/utils";
import { PrimitiveTypeBitcoinAddress } from "@effectstream/sm/builtin";

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
    (builder) => builder.setSecurityNamespace("e2e-bitcoin"),
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
        name: "bitcoin",
        type: ConfigNetworkType.BITCOIN,
        rpcUrl: "http://127.0.0.1:18443",
        rpcAuth: { username: "dev", password: "devpassword" },
        network: "regtest",
        chainIdentifier: "regtest",
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
        (networks) => (networks as any).bitcoin,
        (network, deployments) => ({
          name: "parallelBitcoin",
          type: ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
          startBlockHeight: 0 as BlockNumber,
          delayMs: 20000,
          pollingInterval: 10_000,
          confirmationDepth: 0,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelBitcoin,
        (network, deployments, syncProtocol) => ({
          name: "BitcoinAddress",
          type: PrimitiveTypeBitcoinAddress,
          startBlockHeight: 101,
          watchAddress: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
          stateMachinePrefix: "bitcoin-transaction",
        }),
      )
  )
  .build();
