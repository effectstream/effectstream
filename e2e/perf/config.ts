import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import type { BlockNumber } from "@effectstream/utils";

const mainSyncProtocolName = "mainNtp";

// ── Throughput knobs (env-overridable) ────────────────────────────────────────
export const NTP_BLOCK_TIME_MS = parseInt(
  process.env["PERF_NTP_BLOCK_TIME_MS"] || "1000",
  10,
);
const POLLING_INTERVAL = parseInt(
  process.env["PERF_POLLING_INTERVAL_MS"] || "500",
  10,
);
const STEP_SIZE = parseInt(process.env["PERF_STEP_SIZE"] || "1000", 10);

// Backpressure pressure mode — default on, `0` to opt out.
// See e2e/perf/README.md ("Backpressure pressure mode").
export const BACKPRESSURE_LAG_S = parseInt(
  process.env["PERF_BACKPRESSURE_LAG_S"] || "600",
  10,
);

// Resume from the persisted NTP start time if the DB already has pages, so a
// restart doesn't re-simulate the whole timeline. Fresh DB → start at "now".
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
      (result.rows[0].page_number * NTP_BLOCK_TIME_MS);
  } catch {
    // DB not initialized yet
  }
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("e2e-perf"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Fresh DB: seed a stale start (backpressure mode); resume: persisted start.
        startTime: launchStartTime ??
          (new Date().getTime() - BACKPRESSURE_LAG_S * 1000),
        blockTimeMS: NTP_BLOCK_TIME_MS,
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmParallel_fast",
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
          pollingInterval: POLLING_INTERVAL,
        }),
      )
      .addParallel(
        (networks) => (networks as any).evmParallel_fast,
        (network, deployments) => ({
          name: "parallelEvmRPC_fast",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1 as BlockNumber,
          pollingInterval: POLLING_INTERVAL,
          confirmationDepth: 1,
          stepSize: STEP_SIZE,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "Counter",
          type: "EVM:CUSTOM-COUNTER",
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31337["CounterModule#Counter"],
          stateMachinePrefix: "counter-stm",
        }),
      )
  )
  .build();
