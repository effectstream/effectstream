// =============================================================================
// PLACEHOLDER FOR PRODUCTION
// -----------------------------------------------------------------------------
// This file is a starting point for a mainnet deployment. Before going live:
//   - Replace the hard-coded `arbitrum` chain with the network you actually run.
//   - Source EVERY secret/endpoint from environment variables (see below) — do
//     not commit RPC URLs, contract addresses, or start blocks.
//   - Set EVM_START_BLOCK to the block your EffectstreamL2 contract was
//     deployed at (replaying from genesis on a long chain is slow + costly).
//   - Review pollingInterval / confirmationDepth for your latency vs. reorg
//     safety trade-off.
// =============================================================================
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeEVMEffectstreamL2 } from "@effectstream/sm/builtin";
import { arbitrum } from "viem/chains";
import { getConnection } from "@effectstream/db";

const EVM_RPC_URL = process.env.EVM_RPC_URL;
if (!EVM_RPC_URL) throw new Error("EVM_RPC_URL is required for mainnet");

const EVM_START_BLOCK = parseInt(process.env.EVM_START_BLOCK ?? "", 10);
if (isNaN(EVM_START_BLOCK)) throw new Error("EVM_START_BLOCK is required for mainnet");

const EFFECTSTREAM_L2_ADDRESS = process.env.EFFECTSTREAM_L2_ADDRESS as `0x${string}`;
if (!EFFECTSTREAM_L2_ADDRESS) throw new Error("EFFECTSTREAM_L2_ADDRESS is required for mainnet");

let launchStartTime = parseInt(process.env.NTP_START_TIME ?? "", 10);
if (isNaN(launchStartTime)) {
  const dbConn = getConnection();
  try {
    const result = await dbConn.query(`
      SELECT * FROM effectstream.sync_protocol_pagination
      WHERE protocol_name = 'mainNtp'
      ORDER BY page_number ASC LIMIT 1
    `);
    if (result?.rows.length) {
      launchStartTime = result.rows[0].page.root - (result.rows[0].page_number * 1000);
    }
  } catch { /* DB not initialized yet */ }
  if (isNaN(launchStartTime)) launchStartTime = Date.now();
}

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("gamemaker"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime,
        blockTimeMS: 1000,
      })
      .addViemNetwork({
        ...arbitrum,
        name: "evmMain",
        rpcUrls: { default: { http: [EVM_RPC_URL] } },
      })
  )
  .buildDeployments((builder) =>
    builder.addDeployment(
      (networks) => networks.evmMain,
      (_network) => ({
        name: "EffectstreamL2Module#MyEffectstreamL2",
        address: EFFECTSTREAM_L2_ADDRESS,
      }),
    )
  )
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
        (networks) => networks.evmMain,
        (network, _deployments) => ({
          name: "mainEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: EVM_START_BLOCK,
          pollingInterval: 2000,
          confirmationDepth: 10,
          stepSize: 100,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.mainEvmRPC,
      (_network, _deployments, _syncProtocol) => ({
        name: "EffectstreamL2",
        type: PrimitiveTypeEVMEffectstreamL2,
        startBlockHeight: EVM_START_BLOCK,
        contractAddress: EFFECTSTREAM_L2_ADDRESS,
      }),
    )
  )
  .build();
