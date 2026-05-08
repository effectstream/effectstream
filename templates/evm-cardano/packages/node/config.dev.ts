import { contractAddressesEvmMain } from "@evm-cardano/contracts-evm";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import { getConnection } from "@effectstream/db";
import {
  PrimitiveTypeEVMERC721,
  PrimitiveTypeCardanoTransfer,
} from "@effectstream/sm/builtin";

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
    if (!result || !result.rows.length) throw new Error("DB is empty");
    launchStartTime =
      result.rows[0].page.root - result.rows[0].page_number * 1000;
  } catch {
    // DB not initialized yet
  }

  try {
    const latestResponse = await fetch("http://localhost:3000/blocks/latest");
    const latestBlock = await latestResponse.json();
    yaciDevKitStartTime = latestBlock.time * 1000;
    yaciDevKitStartTime = new Date().getTime() - yaciDevKitStartTime;
    console.log("yaciDevKitStartTime", yaciDevKitStartTime);
  } catch {
    // Dolos not available yet
  }
}

const { extend: _, ...hardhatClean } = hardhat;

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("evm-cardano"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addViemNetwork({ ...hardhatClean, name: "evmMain" } as any)
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000",
        network: "yaci",
      }),
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
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => networks.evmMain,
        (network) => ({
          name: "mainEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500,
          confirmationDepth: 1,
        }),
      )
      .addParallel(
        (networks) => (networks as any).yaci,
        () => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051",
          startChainPoint: "origin",
          delayMs: yaciDevKitStartTime || 0,
          pollingInterval: 1000,
          headers: { "x-rpc-key": "dev" },
        }),
      ),
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        () => ({
          name: "EVM_ERC721",
          type: PrimitiveTypeEVMERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31337[
              "Erc721DevModule#Erc721Dev"
            ],
          stateMachinePrefix: "nft-transfer",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        () => ({
          name: "Cardano_Transfer",
          type: PrimitiveTypeCardanoTransfer,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-transfer",
          predicate: {},
        }),
      ),
  )
  .build();
