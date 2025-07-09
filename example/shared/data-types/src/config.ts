// import deployedEvmAddresses from "@example/evm-contracts/deployments";

import {
  contractAddressesEvmMain,
  // contractAddressesEvmParallel,
  // deploy,
} from "@my-project/evm-contracts";

import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  getEvmEvent,
} from "@paima/config";
import { hardhat } from "viem/chains";
import type { BlockNumber, TimestampMs } from "@paima/utils";

// TODO: replace with @paima/evm-contracts
// import { erc20Abi, erc721Abi } from "viem"; // TODO: ABIs for Paima built-in primitives should be in the @paima/evm-contracts ideally
// import { paimal2 } from "@my-project/evm-contracts";

import {
  erc20dev,
  erc721dev,
  paimal2contract,
} from "@my-project/evm-contracts";
// TODO: This should typed from the grammar types.
const stfInputs = {
  tokenTransfer: "transfer",
} as const;

// comes from hardhat.config.ts
const parallelBlockTime: TimestampMs = 10 * 1000;

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("asdf"),
  )
  .buildNetworks((builder) =>
    builder
      .addViemNetwork({
        ...hardhat,
        name: "evmMain",
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmParallel",
        rpcUrls: {
          default: { http: ["http://127.0.0.1:8546"] },
        },
        id: 31338, // taken from hardhat.config.ts
      })
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000", // yaci-devkit default URL
        network: "yaci",
      })
  )
  .buildDeployments((builder) =>
    builder
      .addDeployment(
        (networks) => networks.evmMain,
        (_network) => ({
          name: "Erc20DevModule#Erc20Dev",
          address:
            contractAddressesEvmMain().chain31337["Erc20DevModule#Erc20Dev"],
        }),
      )
      .addDeployment(
        (networks) => networks.evmMain,
        (_network) => ({
          name: "Erc20DevModule#Erc20Dev",
          address:
            contractAddressesEvmMain().chain31337["Erc20DevModule#Erc20Dev"],
        }),
      )
      .addDeployment(
        (networks) => networks.evmMain,
        (_network) => ({
          name: "PaimaL2ContractModule#PaimaL2Contract",
          address: contractAddressesEvmMain().chain31337[
            "PaimaL2ContractModule#PaimaL2Contract"
          ],
        }),
      )
      .addDeployment(
        (networks) => networks.evmParallel,
        (_network) => ({
          name: "Erc20DevModule#Erc20Dev",
          address:
            contractAddressesEvmMain().chain31337["Erc20DevModule#Erc20Dev"],
        }),
      )
      .addDeployment(
        (networks) => networks.evmParallel,
        (_network) => ({
          name: "Erc20DevModule#Erc20Dev",
          address:
            contractAddressesEvmMain().chain31338["Erc20DevModule#Erc20Dev"],
        }),
      )
  ).buildSyncProtocols((builder) =>
    builder
      .addMain((networks) => networks.evmMain, (network, deployments) => ({
        name: "mainEvmRPC",
        type: ConfigSyncProtocolType.EVM_RPC_MAIN,
        chainUri: network.rpcUrls.default.http[0],
        startBlockHeight: 1,
        pollingInterval: 500, // poll quickly to react fast
      }))
      .addParallel(
        (networks) => networks.evmParallel,
        (network, deployments) => ({
          name: "parallelEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          pollingInterval: 1000, // we can poll slower since it's not a blocker
          delayMs: parallelBlockTime * 6,
          startBlockHeight: 1 as BlockNumber,
          confirmationDepth: 2, // TODO: test this
        }),
      )
      .addParallel(
        (networks) => networks.yaci,
        (network, deployments) => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051", // dolos utxorpc address
          startSlot: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.mainEvmRPC,
      (network, deployments, syncProtocol) => ({
        name: "Aribitrum_Token",
        type: ConfigPrimitiveType.EvmRpcERC20,

        startBlockHeight: 0,
        contractAddress:
          contractAddressesEvmMain().chain31337["Erc20DevModule#Erc20Dev"],
        abi: getEvmEvent(erc20dev.abi, "Transfer(address,address,uint256)"),
        scheduledPrefix: stfInputs.tokenTransfer,
      }),
    )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "PaimaGameInteraction",
          type: ConfigPrimitiveType.EvmRpcPaimaL2,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            ["chain31337"]["PaimaL2ContractModule#PaimaL2Contract"],
          abi: getEvmEvent(
            paimal2contract.abi,
            "PaimaGameInteraction(address,bytes,uint256)",
          ),
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "Arbitrum_ERC721",
          type: ConfigPrimitiveType.EvmRpcERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"],
          abi: getEvmEvent(
            erc721dev.abi,
            "Transfer(address,address,uint256)",
          ),
          // TODO This is not defined. Should be a error.
          scheduledPrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "L1_ERC721_Token",
          type: ConfigPrimitiveType.EvmRpcERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31338["Erc721DevModule#Erc721Dev"],
          abi: getEvmEvent(
            erc721dev.abi,
            "Transfer(address,address,uint256)",
          ),
          // TODO This is not defined. Should be a error.
          scheduledPrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "ETH_L1_ERC20",
          type: ConfigPrimitiveType.EvmRpcERC20,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31338["Erc20DevModule#Erc20Dev"],
          abi: getEvmEvent(
            erc20dev.abi,
            "Transfer(address,address,uint256)",
          ),
          // TODO This is not defined. Should be a error.
          scheduledPrefix: "transfer-erc20-2",
        }),
      )
  )
  .build();
