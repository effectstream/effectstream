import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeCardanoTransfer } from "@effectstream/sm/builtin";
import { getConnection } from "@effectstream/db";
import { hardhat } from "viem/chains";
import { setLaunchpadAddress } from "./launchpad-config.ts";

const { extend: _, ...hardhatClean } = hardhat;

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
let yaciDevKitStartTime: number | undefined;

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

  try {
    const latestResponse = await fetch("http://localhost:3000/blocks/latest");
    const latestBlock = await latestResponse.json();
    yaciDevKitStartTime = new Date().getTime() - latestBlock.time * 1000;
    console.log("yaciDevKitStartTime", yaciDevKitStartTime);
  } catch {
    // Dolos blockfrost not available yet
  }
}

let launchpadProxyAddress = "0x0000000000000000000000000000000000000000";
try {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const extraPath = path.resolve(import.meta.dirname!, "../contracts-evm/build/extra-addresses.json");
  const extra = JSON.parse(fs.readFileSync(extraPath, "utf-8"));
  launchpadProxyAddress = extra.launchpadProxy;
  console.log("Loaded launchpad proxy address:", launchpadProxyAddress);
  setLaunchpadAddress("test-launchpad-1", launchpadProxyAddress);
} catch {
  console.log("extra-addresses.json not found, using zero address for launchpad proxy");
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("preorder-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addViemNetwork({
        ...hardhatClean,
        name: "evmMain",
      } as any)
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000",
        network: "yaci",
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
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => networks.evmMain,
        (network, deployments) => ({
          name: "parallelEvmRpc",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 1000,
          confirmationDepth: 1,
        }),
      )
      .addParallel(
        (networks) => (networks as any).yaci,
        (network, deployments) => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051",
          startChainPoint: "origin",
          delayMs: yaciDevKitStartTime || 0,
          pollingInterval: 1000,
          headers: {
            "x-rpc-key": "dev",
          },
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRpc,
        () => ({
          name: "LaunchpadBuyItems",
          type: "EVM:BUY-ITEMS",
          startBlockHeight: 0,
          contractAddress: launchpadProxyAddress,
          stateMachinePrefix: "buy-items",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          name: "CardanoTransfer",
          type: PrimitiveTypeCardanoTransfer,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-payment",
          predicate: {},
        }),
      )
  )
  .build();
