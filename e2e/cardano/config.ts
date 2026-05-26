import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeUtxorpcGeneric,
  PrimitiveTypeCardanoMintBurn,
  PrimitiveTypeCardanoTransfer,
  PrimitiveTypeCardanoPoolDelegation,
  PrimitiveTypeCardanoDelayedAsset,
  PrimitiveTypeCardanoProjectedNFT,
} from "@effectstream/sm/builtin";
import { existsSync, readFileSync } from "fs";
import path from "path";

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
let yaciDevKitStartTime: number | undefined;

// Read the test policy ID created by submit-tx.ts (available because sync depends on submit-tx)
const policyIdFile = path.resolve(import.meta.dirname!, "../shared/contracts/cardano/temp/test-policy-id.txt");
const TEST_POLICY_ID = existsSync(policyIdFile)
  ? readFileSync(policyIdFile, "utf-8").trim()
  : "";

const scriptHashFile = path.resolve(import.meta.dirname!, "../shared/contracts/cardano/temp/hololocker-script-hash.txt");
const HOLOLOCKER_SCRIPT_HASH = existsSync(scriptHashFile)
  ? readFileSync(scriptHashFile, "utf-8").trim()
  : "";

if (TEST_POLICY_ID) {
  console.log(`[config] Loaded test policy ID: ${TEST_POLICY_ID}`);
} else {
  console.warn("[config] No test policy ID found — MintBurn/DelayedAsset primitives will not match.");
}
if (HOLOLOCKER_SCRIPT_HASH) {
  console.log(`[config] Loaded hololocker script hash: ${HOLOLOCKER_SCRIPT_HASH}`);
} else {
  console.warn("[config] No hololocker script hash found — ProjectedNFT primitive will not match.");
}

if (typeof process !== "undefined") {
  // NOTE: This guard prevents this code from running in the browser.
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
    // DB not initialized yet - use current time
  }

  // We fetch the latest block from the dolos mini blockfrost endpoint
  // to compute the delay between yaci genesis time and wall-clock time.
  try {
    const latestResponse = await fetch("http://localhost:3000/blocks/latest");
    const latestBlock = await latestResponse.json();
    yaciDevKitStartTime = latestBlock.time * 1000;
    yaciDevKitStartTime = new Date().getTime() - yaciDevKitStartTime;
    console.log("yaciDevKitStartTime", yaciDevKitStartTime);
  } catch {
    // Dolos blockfrost not available yet
  }
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("e2e-cardano"),
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
          pollingInterval: 500,
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
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        (network, deployments, syncProtocol) => ({
          name: "UtxoRpcGeneric",
          type: PrimitiveTypeUtxorpcGeneric,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-utxo-rpc-generic",
          predicate: {},
        }),
      )

      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          name: "CardanoMintBurn",
          type: PrimitiveTypeCardanoMintBurn,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-mint-burn",
          policyIds: TEST_POLICY_ID ? [TEST_POLICY_ID] : [],
        }),
      )

      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          name: "CardanoTransfer",
          type: PrimitiveTypeCardanoTransfer,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-transfer",
          predicate: {},
        }),
      )

      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          name: "CardanoPoolDelegation",
          type: PrimitiveTypeCardanoPoolDelegation,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-pool-delegation",
          pools: ["7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57"],
          network: "yaci",
        }),
      )

      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          name: "CardanoDelayedAsset",
          type: PrimitiveTypeCardanoDelayedAsset,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-delayed-asset",
          policyIds: TEST_POLICY_ID ? [TEST_POLICY_ID] : [],
        }),
      )

      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          name: "CardanoProjectedNFT",
          type: PrimitiveTypeCardanoProjectedNFT,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-projected-nft",
          scriptHash: HOLOLOCKER_SCRIPT_HASH || "0000000000000000000000000000000000000000000000000000000000",
        }),
      )
  )
  .build();
