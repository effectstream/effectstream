import { contractAddressesEvmMain } from "@e2e-v2/evm-contracts";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import type { BlockNumber } from "@effectstream/utils";
import {
  PrimitiveTypeEVMERC1155,
  PrimitiveTypeEVMERC20,
  PrimitiveTypeEVMERC721,
  PrimitiveTypeEVMEffectstreamL2,
} from "@effectstream/sm/builtin";

import { effectstreamL2Grammar } from "./grammar.ts";

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
    (builder) => builder.setSecurityNamespace("e2e-v2-evm"),
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
        ...hardhat,
        name: "evmParallel_fast",
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmParallel_slow",
        rpcUrls: {
          default: { http: ["http://127.0.0.1:8546"] },
        },
        id: 31338,
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
        (networks) => (networks as any).evmParallel_fast,
        (network, deployments) => ({
          name: "parallelEvmRPC_fast",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500,
          confirmationDepth: 1,
        }),
      )
      .addParallel(
        (networks) => (networks as any).evmParallel_slow,
        (network, deployments) => ({
          name: "parallelEvmRPC_slow",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          pollingInterval: 500,
          delayMs: 1000,
          startBlockHeight: 1 as BlockNumber,
          confirmationDepth: 2,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "Aribitrum_Token",
          type: PrimitiveTypeEVMERC20,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31337["EffectstreamErc20DevModule#EffectstreamErc20Dev"],
          stateMachinePrefix: "transfer-erc20",
        }),
      )
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
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "EffectstreamGameInteraction",
          type: PrimitiveTypeEVMEffectstreamL2,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()["chain31337"][
            "EffectstreamL2ContractModule#MyEffectstreamL2Contract"
          ],
          effectstreamL2Grammar: effectstreamL2Grammar,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "Arbitrum_ERC721",
          type: PrimitiveTypeEVMERC721,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31337["Erc721DevModule#Erc721Dev"],
          stateMachinePrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_slow,
        (network, deployments, syncProtocol) => ({
          name: "L1_ERC721_Token",
          type: PrimitiveTypeEVMERC721,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31338["Erc721DevModule#Erc721Dev"],
          stateMachinePrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_slow,
        (network, deployments, syncProtocol) => ({
          name: "ETH_L1_ERC20",
          type: PrimitiveTypeEVMERC20,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31338["EffectstreamErc20DevModule#EffectstreamErc20Dev"],
          stateMachinePrefix: "transfer-erc20",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "L1_ERC1155_TOKEN",
          type: PrimitiveTypeEVMERC1155,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31337["Erc1155DevModule#ERC1155Dev"],
          stateMachinePrefix: "transfer-erc1155",
        }),
      )
  )
  .build();
