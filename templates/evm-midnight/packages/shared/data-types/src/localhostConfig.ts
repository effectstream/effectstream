import { contractAddressesEvmMain } from "@example/evm-contracts";
import { readMidnightContract } from "@example/midnight-contracts";

import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  getEvmEvent,
} from "@paimaexample/config";
import { hardhat } from "viem/chains";
import type { TimestampMs } from "@paimaexample/utils";
import { erc721dev } from "@example/evm-contracts";

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("evm-midnight-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Initial time for the Paima Engine Node. Unix Timestamp in milliseconds.
        // Give 2 minutes to the server to start syncing.
        // In development mode local chains can take a while to start and deploy contracts.
        startTime: new Date().getTime(),
        // Block size is milliseconds, this will be used to sync other chains.
        // Block times will be exact, and not affected by the network latency, or server time.
        blockTimeMS: 1000,
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmMain",
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        genesisHash:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        networkId: 0,
        nodeUrl: "http://127.0.0.1:9944",
      })
  )
  .buildDeployments((builder) =>
    builder
      .addDeployment(
        (networks) => networks.evmMain,
        (_network) => ({
          name: "Erc721DevModule#Erc721Dev",
          address: contractAddressesEvmMain()
            .chain31337["Erc721DevModule#Erc721Dev"],
        }),
      )
  ).buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel((networks) => networks.evmMain, (network, deployments) => ({
        name: "mainEvmRPC",
        type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
        chainUri: network.rpcUrls.default.http[0],
        startBlockHeight: 1,
        pollingInterval: 500,
        confirmationDepth: 1,
      }))
      .addParallel(
        (networks) => networks.midnight,
        (network, deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          indexer: "http://127.0.0.1:8088/api/v1/graphql",
          indexerWs: "ws://127.0.0.1:8088/api/v1/graphql/ws",
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
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
        (syncProtocols) => syncProtocols.parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "MidnightContractState",
          type: ConfigPrimitiveType.MidnightContractState,
          startBlockHeight: 1,
          contractAddress: readMidnightContract().contractAddress,
          scheduledPrefix: "midnightContractState",
        }),
      )
  )
  .build();
