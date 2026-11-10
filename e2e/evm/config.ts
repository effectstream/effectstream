import { contractAddressesEvmMain } from "@e2e/evm-contracts";
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
import { CKB_RELAY_PRIMITIVE_NAME, CKB_RELAY_PRIMITIVE_TYPE, CKB_RELAY_SYNC_PROTOCOL } from "./ckb-relay-primitive.ts";

const ckbRelayDemo = process.env["CKB_RELAY_DEMO"] === "true";
const ckbRpcUrl = process.env["CKB_RPC_URL"] ?? "http://127.0.0.1:8114";
const ckbGenesisBlockHash = process.env["CKB_GENESIS_BLOCK_HASH"];
const ckbTargetScript = {
  role: (process.env["CKB_TARGET_SCRIPT_ROLE"] ?? "lock") as "lock" | "type",
  script: {
    codeHash: process.env["CKB_TARGET_SCRIPT_CODE_HASH"] ?? "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hashType: (process.env["CKB_TARGET_SCRIPT_HASH_TYPE"] ?? "type") as "data" | "type" | "data1" | "data2",
    args: process.env["CKB_TARGET_SCRIPT_ARGS"] ?? "0x8e42b1999f265a0078503c4acec4d5e134534297",
  },
};

if (ckbRelayDemo) {
  if (!ckbGenesisBlockHash || !/^0x[0-9a-fA-F]{64}$/.test(ckbGenesisBlockHash)) {
    throw new Error("CKB_RELAY_DEMO requires CKB_GENESIS_BLOCK_HASH from the local OffCKB node.");
  }
  if (ckbRpcUrl !== "http://127.0.0.1:8114") {
    throw new Error("CKB_RELAY_DEMO is fixed to the local OffCKB RPC at 127.0.0.1:8114.");
  }
}

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
    (builder) => builder.setSecurityNamespace("e2e-evm"),
  )
  .buildNetworks((builder) => {
    const configured = builder
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
      });
    if (ckbRelayDemo) {
      (configured as any).addNetwork({
        name: "ckbLocal",
        type: ConfigNetworkType.CKB,
        rpcUrl: ckbRpcUrl,
        network: "devnet",
        genesisBlockHash: ckbGenesisBlockHash,
      });
    }
    return configured;
  })
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) => {
    const configured = builder
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
      );
    if (ckbRelayDemo) {
      (configured as any).addParallel(
        (networks: any) => networks.ckbLocal,
        () => ({
          name: CKB_RELAY_SYNC_PROTOCOL,
          type: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
          startBlockHeight: Number(process.env["CKB_START_BLOCK_HEIGHT"] ?? "0"),
          stopBlockHeight: null,
          pollingInterval: 1_000,
          requestTimeoutMs: 15_000,
          confirmationDepth: 0,
          reorgWindow: 64,
          targetScript: ckbTargetScript,
          delayMs: 0,
          stepSize: 1,
        }),
      );
    }
    return configured;
  })
  .buildPrimitives((builder) => {
    const configured = builder
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
      );
    if (ckbRelayDemo) {
      (configured as any).addPrimitive(
        (syncProtocols: any) => syncProtocols[CKB_RELAY_SYNC_PROTOCOL],
        () => ({
          name: CKB_RELAY_PRIMITIVE_NAME,
          type: CKB_RELAY_PRIMITIVE_TYPE,
          startBlockHeight: 0,
        }),
      );
    }
    return configured;
  })
  .build();
