import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeCardanoProjectedNFT } from "@effectstream/sm/builtin";
import { existsSync, readFileSync } from "fs";
import path from "path";

const mainSyncProtocolName = "mainNtp";
let yaciDevKitStartTime: number | undefined;

const scriptHashFile = path.resolve(import.meta.dirname!, "../contracts-cardano/temp/hololocker-script-hash.txt");
const HOLOLOCKER_SCRIPT_HASH = existsSync(scriptHashFile)
  ? readFileSync(scriptHashFile, "utf-8").trim()
  : "";

if (HOLOLOCKER_SCRIPT_HASH) {
  console.log(`[config] Loaded hololocker script hash: ${HOLOLOCKER_SCRIPT_HASH}`);
} else {
  console.warn("[config] No hololocker script hash found — ProjectedNFT primitive will not match.");
}

if (typeof process !== "undefined") {
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
    (builder) => builder.setSecurityNamespace("projected-nft-preorder"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
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
          pollingInterval: 1000,
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
