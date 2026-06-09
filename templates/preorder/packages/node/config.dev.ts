import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeEVMEffectstreamL2,
  PrimitiveTypeUtxorpcGeneric,
} from "@effectstream/sm/builtin";
import { getConnection } from "@effectstream/db";
import { hardhat } from "viem/chains";
import { EXTRA_ADDRESSES } from "./addresses.ts";
import { adminGrammar } from "./grammar.ts";
import { RECEIPT_POLICY_ID } from "./cardano-receipt.ts";

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

const launchpadProxyAddress = EXTRA_ADDRESSES.launchpadProxy;
const effectStreamL2Address = EXTRA_ADDRESSES.effectStreamL2;
console.log("Launchpad proxy:", launchpadProxyAddress);
console.log("EffectstreamL2:", effectStreamL2Address);

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
        (syncProtocols) => syncProtocols.parallelEvmRpc,
        () => ({
          // Captures the launchpad's on-chain ReferrerReward payouts.
          name: "LaunchpadReferrerReward",
          type: "EVM:REFERRER-REWARD",
          startBlockHeight: 0,
          contractAddress: launchpadProxyAddress,
          stateMachinePrefix: "referrer-reward",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRpc,
        () => ({
          // Deterministic admin/config inbox. Submitted commands route by grammar prefix
          // (create-campaign / set-product / end-campaign) into the state machine.
          name: "EffectstreamL2Admin",
          type: PrimitiveTypeEVMEffectstreamL2,
          startBlockHeight: 0,
          contractAddress: effectStreamL2Address,
          effectstreamL2Grammar: adminGrammar,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          // Generic UTxORPC primitive matching purchase-receipt mints of our Aiken policy.
          // The STM deserializes the raw tx (see decode-utxorpc-tx.ts).
          name: "CardanoReceipt",
          type: PrimitiveTypeUtxorpcGeneric,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-payment",
          predicate: RECEIPT_POLICY_ID
            ? { match: { cardano: { mints_asset: { policy_id: RECEIPT_POLICY_ID } } } }
            : {},
        }),
      )
  )
  .build();
