import { readMidnightContract as readMidnightContractCounter } from "@e2e/midnight-contracts/contract-counter-address";
import { readMidnightContract as readMidnightContractEip20 } from "@e2e/midnight-contracts/contract-eip-20-address";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { readAvailApplication } from "@e2e/avail-contracts";
import { getConnection } from "@paima/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paima/config";
import { hardhat } from "viem/chains";
import type { BlockNumber } from "@paima/utils";

import { paimaL2Grammar } from "./grammar.ts";
import {
  PrimitiveTypeAvailGeneric,
  PrimitiveTypeEVMERC1155,
  PrimitiveTypeEVMERC20,
  PrimitiveTypeEVMERC721,
  PrimitiveTypeEVMPaimaL2,
  PrimitiveTypeMidnightGeneric,
} from "@paima/sm/builtin";
import * as SimpleTokenContract from "@e2e/midnight-contract-eip-20/contract";
import * as CounterContract from "@e2e/midnight-contract-counter-basic/contract";
 
// TODO: This is a workaround to disable yaci-devkit in linux for testing.
//       There is a unknown error when launching this process.
//       error: Text file busy (os error 26)
const yaci_enabled = Deno
  ? (Deno.env.get("DISABLE_LINUX_YACI") === "true" ? false : true)
  : false;

// NOTE: This disable midnight sync, allowing for faster testing.
const midnight_enabled = Deno
  ? (Deno.env.get("DISABLE_MIDNIGHT") === "true" ? false : true)
  : true;

// NOTE: This disable avail sync, allowing for faster testing.
const avail_enabled = Deno
  ? (Deno.env.get("DISABLE_AVAIL") === "true" ? false : true)
  : true;
/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

if (Deno) {
  // NOTE: This does not work when imported by the browser.
  //       We setup a Deno as undefined in the browser, to make it skip this import.
  // const { getConnection } = await import("@paima/db");
  const dbConn = getConnection();
  try {
    const result = await dbConn.query(`
      SELECT * FROM paima.sync_protocol_pagination 
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
    // This is not an error.
    // Do nothing, the DB has not been initialized yet.
  }
}

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("example-e2e-test"),
  )
  .buildNetworks((builder) => {
    let b = builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Initial time for the Paima Engine Node. Unix Timestamp in milliseconds.
        // Give 2 minutes to the server to start syncing.
        // In development mode local chains can take a while to start and deploy contracts.
        startTime: launchStartTime ?? new Date().getTime(),
        // Block size is milliseconds, this will be used to sync other chains.
        // Block times will be exact, and not affected by the network latency, or server time.
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
        id: 31338, // taken from hardhat.config.ts
      });
    if (avail_enabled) {
      b = b.addNetwork({
        name: "avail",
        type: ConfigNetworkType.AVAIL,
        genesisSeed: "//Alice",
        nodeUrl: "ws://127.0.0.1:9955/ws",
        genesisHash: readAvailApplication().genesisHash,
        caip2: `avail:local`,
      });
    }
    if (midnight_enabled) {
      b = b
        .addNetwork({
          name: "midnight",
          type: ConfigNetworkType.MIDNIGHT,
          genesisHash:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          networkId: 0, // NetworkId.Undeployed,
          nodeUrl: "http://127.0.0.1:9944",
        });
    }

    if (yaci_enabled) {
      b = b
        .addNetwork({
          name: "yaci",
          type: ConfigNetworkType.CARDANO,
          nodeUrl: "http://127.0.0.1:10000", // yaci-devkit default URL
          network: "yaci",
        });
    }
    return b;
  })
  .buildDeployments((builder) =>
    builder
      .addDeployment(
        (networks) => networks.evmParallel_fast,
        (_network) => ({
          name: "PaimaErc20DevModule#PaimaErc20Dev",
          address: contractAddressesEvmMain()
            .chain31337["PaimaErc20DevModule#PaimaErc20Dev"],
        }),
      )
      .addDeployment(
        (networks) => networks.evmParallel_fast,
        (_network) => ({
          name: "PaimaL2ContractModule#MyPaimaL2Contract",
          address: contractAddressesEvmMain().chain31337[
            "PaimaL2ContractModule#MyPaimaL2Contract"
          ],
        }),
      )
      .addDeployment(
        (networks) => networks.evmParallel_slow,
        (_network) => ({
          name: "PaimaErc20DevModule#PaimaErc20Dev",
          address: contractAddressesEvmMain()
            .chain31337["PaimaErc20DevModule#PaimaErc20Dev"],
        }),
      )
  ).buildSyncProtocols((builder) => {
    let result = builder
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
        (networks) => networks.evmParallel_fast,
        (network, deployments) => ({
          name: "parallelEvmRPC_fast",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500, // poll quickly to react fast
          confirmationDepth: 1, // TODO: test this
        }),
      )
      .addParallel(
        (networks) => networks.evmParallel_slow,
        (network, deployments) => ({
          name: "parallelEvmRPC_slow",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          pollingInterval: 500, // we can poll slower since it's not a blocker
          delayMs: 1000,
          startBlockHeight: 1 as BlockNumber,
          confirmationDepth: 2, // TODO: test this
        }),
      );

    if (avail_enabled) {
      result = result.addParallel(
        (networks) => (networks as any).avail,
        (network, deployments) => ({
          name: "parallelAvail",
          type: ConfigSyncProtocolType.AVAIL_PARALLEL,
          rpc: network.nodeUrl,
          lightClient: "http://127.0.0.1:7007",
          startBlockHeight: 1,
          pollingInterval: 1_000,
          delayMs: 60_000, // 1 minute
        }),
      );
    }

    if (midnight_enabled) {
      result = result
        .addParallel(
          (networks) => (networks as any).midnight,
          (network, deployments) => ({
            name: "parallelMidnight",
            type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 1000,
            delayMs: 18000,
            indexer: "http://127.0.0.1:8088/api/v1/graphql",
            indexerWs: "ws://127.0.0.1:8088/api/v1/graphql/ws",
          }),
        );
    }

    if (yaci_enabled) {
      result = result
        .addParallel(
          (networks) => (networks as any).yaci,
          (network, deployments) => ({
            name: "parallelUtxoRpc",
            type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
            rpcUrl: "http://127.0.0.1:50051", // dolos utxorpc address
            startSlot: 1,
            delayMs: 20000,
          }),
        );
    }

    return result;
  })
  .buildPrimitives((builder) => {
    builder.addPrimitive(
      (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
      (network, deployments, syncProtocol) => ({
        name: "Aribitrum_Token",
        type: PrimitiveTypeEVMERC20,
        startBlockHeight: 0,
        contractAddress: contractAddressesEvmMain()
          .chain31337["PaimaErc20DevModule#PaimaErc20Dev"],
        stateMachinePrefix: "transfer-erc20",
      })
    )
    .addPrimitive(
      (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
      (network, deployments, syncProtocol) => ({
        name: "Counter",
        type: 'EVM:CUSTOM-COUNTER',
        startBlockHeight: 0,
        contractAddress: contractAddressesEvmMain()
          .chain31337["CounterModule#Counter"],
        stateMachinePrefix: "counter-stm",
      })
    )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
        (network, deployments, syncProtocol) =>
          ({
            name: "PaimaGameInteraction",
            type: PrimitiveTypeEVMPaimaL2,
            startBlockHeight: 0,
            contractAddress: contractAddressesEvmMain()["chain31337"][
              "PaimaL2ContractModule#MyPaimaL2Contract"
            ],
            paimaL2Grammar: paimaL2Grammar,
          }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
        (network, deployments, syncProtocol) =>
          ({
            name: "Arbitrum_ERC721",
            type: PrimitiveTypeEVMERC721,
            startBlockHeight: 0,
            contractAddress: contractAddressesEvmMain()
              .chain31337["Erc721DevModule#Erc721Dev"],
            stateMachinePrefix: "transfer-assets",
          }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_slow,
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
        (syncProtocols) => syncProtocols.parallelEvmRPC_slow,
        (network, deployments, syncProtocol) => ({
          name: "ETH_L1_ERC20",
          type: PrimitiveTypeEVMERC20,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31338["PaimaErc20DevModule#PaimaErc20Dev"],
          stateMachinePrefix: "transfer-erc20",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
        (network, deployments, syncProtocol) => ({
          name: "L1_ERC1155_TOKEN",
          type: PrimitiveTypeEVMERC1155,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31337["Erc1155DevModule#ERC1155Dev"],
          stateMachinePrefix: "transfer-erc1155",
        }),
      )
    if (avail_enabled) {
      builder = builder.addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelAvail,
        (network, deployments, syncProtocol) => ({
          name: "AvailContractState",
          type: PrimitiveTypeAvailGeneric,
          startBlockHeight: 1,
          appId: readAvailApplication().appId,
          applicationKey: readAvailApplication().ApplicationKey,
          genesisHash: readAvailApplication().genesisHash,
          stateMachinePrefix: "avail-app-state",
        }),
      );
    }
    if (midnight_enabled) {
      builder = builder
        .addPrimitive(
          (syncProtocols) => (syncProtocols as any).parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "MidnightContractState",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: readMidnightContractCounter().contractAddress,
            stateMachinePrefix: "midnightContractState",
            contract: { ledger: CounterContract.ledger },
            networkId: 0, // NetworkId.Undeployed,
          }),
        ).addPrimitive(
          (syncProtocols) => (syncProtocols as any).parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "Midnight-EIP-20",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: readMidnightContractEip20().contractAddress,
            stateMachinePrefix: "eip20ContractState",
            contract: { ledger: SimpleTokenContract.ledger },
            networkId: 0, // NetworkId.Undeployed,
          }),
        );
    }
    return builder;
  })
  .build();
