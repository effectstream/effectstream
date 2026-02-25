import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { readAvailApplication } from "@e2e/avail-contracts";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import type { BlockNumber } from "@effectstream/utils";

import { paimaL2Grammar } from "./grammar.ts";
import {
  midnightNetworkConfig,
} from "@effectstream/midnight-contracts/midnight-env";
import {
  PrimitiveTypeAvailGeneric,
  PrimitiveTypeEVMERC1155,
  PrimitiveTypeEVMERC20,
  PrimitiveTypeEVMERC721,
  PrimitiveTypeEVMPaimaL2,
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeBitcoinAddress,
  PrimitiveTypeUtxorpcGeneric,
} from "@effectstream/sm/builtin";
import * as SimpleTokenContract from "@e2e/midnight-contract-eip-20/contract";
import * as CounterContract from "@e2e/midnight-contract-counter-basic/contract";
import { getEnv } from "@effectstream/utils/runtime";

const isBackendEnvironment = typeof process !== "undefined" && process.env;

const isEnvTrue = (key: string) => {
  const val = isBackendEnvironment
    ? getEnv(key)
    : (import.meta as any).env["VITE_" + key];
  return ["true", "1", "yes", "y"].includes((val || "").toLowerCase());
};


// TODO: This is a workaround to disable yaci-devkit in linux for testing.
//       There is a unknown error when launching this process.
//       error: Text file busy (os error 26)
const cardano_enabled = !isEnvTrue("DISABLE_CARDANO");

// NOTE: This disable midnight sync, allowing for faster testing.
const midnight_enabled = !isEnvTrue("DISABLE_MIDNIGHT");

// NOTE: This disable avail sync, allowing for faster testing.
const avail_enabled = !isEnvTrue("DISABLE_AVAIL");

// NOTE: This disable bitcoin sync, allowing for faster testing.
const bitcoin_enabled = !isEnvTrue("DISABLE_BITCOIN");

const evm_enabled = !isEnvTrue("DISABLE_EVM");

/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
let yaciDevKitStartTime: number | undefined;
// @ts-ignore
if (typeof Deno !== 'undefined' && Deno) {
  // NOTE: This does not work when imported by the browser.
  //       We setup a Deno as undefined in the browser, to make it skip this import.
  // const { getConnection } = await import("@effectstream/db");
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
    // This is not an error.
    // Do nothing, the DB has not been initialized yet.
  }

    // We fetch the latest block from the dolos mini blockfrost endpoint
    if (cardano_enabled) {
      const response = await fetch("http://localhost:3000/blocks/latest");
      yaciDevKitStartTime = (await response.json()).time * 1000;
      yaciDevKitStartTime = new Date().getTime() - yaciDevKitStartTime;
      console.log("yaciDevKitStartTime", yaciDevKitStartTime);
    }
}

export const config = new ConfigBuilder()
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
      });

    if (evm_enabled) {
      b = b
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
    }

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
          networkId: midnightNetworkConfig.id,
          nodeUrl: midnightNetworkConfig.node,
        });
    }

    if (cardano_enabled) {
      b = b
        .addNetwork({
          name: "yaci",
          type: ConfigNetworkType.CARDANO,
          nodeUrl: "http://127.0.0.1:10000", // yaci-devkit default URL
          network: "yaci",
        });
    }
    if (bitcoin_enabled) {
      b = b.addNetwork({
        name: "bitcoin",
        type: ConfigNetworkType.BITCOIN,
        rpcUrl: "http://127.0.0.1:18443", // bitcoin core address
        rpcAuth: {
          username: "dev",
          password: "devpassword",
        },
        network: "regtest",
        chainIdentifier: "regtest",
      });
    }
    return b;
  })
  .buildDeployments((builder) => builder).buildSyncProtocols((builder) => {
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
      );
    if (evm_enabled) {
      result = result
      .addParallel(
        (networks) => (networks as any).evmParallel_fast,
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
        (networks) => (networks as any).evmParallel_slow,
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
    }

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
            indexer: midnightNetworkConfig.indexer,
            indexerWs: midnightNetworkConfig.indexerWS,
          }),
        );
    }

    if (cardano_enabled) {

      result = result
        .addParallel(
          (networks) => (networks as any).yaci,
          (network, deployments) => ({
            name: "parallelUtxoRpc",
            type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
            rpcUrl: "http://127.0.0.1:50051", // dolos utxorpc address
            // TODO: startChainPoint requires a real block hash from the yaci-devkit genesis. This may need to be fetched dynamically
            startChainPoint: { slot: 1, hash: "" as any },
            // TODO: The exact delay is not correct, but it's close.
            // byron-genesis.json startTime
            // 633 skipped slots
            // 20 minutes delay
            delayMs: yaciDevKitStartTime || 0,
            pollingInterval: 1000,
            headers: {
              'x-rpc-key': 'dev'
            }
          }),
        );
    }

    if (bitcoin_enabled) {
      result = result.addParallel(
        (networks) => (networks as any).bitcoin,
        (network, deployments) => ({
          name: "parallelBitcoin",
          type: ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:18443", // bitcoin core address
          startBlockHeight: 0 as BlockNumber,
          delayMs: 20000,
          pollingInterval: 10_000,
          confirmationDepth: 0,
        }),
      );
    }

    return result;
  })
  .buildPrimitives((builder) => {

    let b = builder;

    if (evm_enabled) {
    b = b.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
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
      (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
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
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
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
        (syncProtocols) => (syncProtocols as any).parallelEvmRPC_fast,
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
            .chain31338["PaimaErc20DevModule#PaimaErc20Dev"],
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
    }
    if (avail_enabled) {
      b = b.addPrimitive(
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
      const counterAddress = readMidnightContract(
        "contract-counter",
        { networkId: midnightNetworkConfig.id },
      ).contractAddress;
      const eip20Address = readMidnightContract(
        "contract-eip-20",
        { networkId: midnightNetworkConfig.id },
      ).contractAddress;
      b = b
        .addPrimitive(
          (syncProtocols) => (syncProtocols as any).parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "MidnightContractState",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: counterAddress,
            stateMachinePrefix: "midnightContractState",
            contract: { ledger: CounterContract.ledger },
            networkId: midnightNetworkConfig.id,
          }),
        ).addPrimitive(
          (syncProtocols) => (syncProtocols as any).parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "Midnight-EIP-20",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: eip20Address,
            stateMachinePrefix: "eip20ContractState",
            contract: { ledger: SimpleTokenContract.ledger },
            networkId: midnightNetworkConfig.id,
          }),
        );
    }
    if (bitcoin_enabled) {
      b = b.addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelBitcoin,
        (network, deployments, syncProtocol) => ({
          name: "BitcoinAddress",
          type: PrimitiveTypeBitcoinAddress,
          startBlockHeight: 101,
          watchAddress: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
          stateMachinePrefix: "bitcoin-transaction",
        }),
      );
    }
    if (cardano_enabled) {
      b = b.addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
        (network, deployments, syncProtocol) => ({
          name: "UtxoRpcGeneric",
          type: PrimitiveTypeUtxorpcGeneric,
          startBlockHeight: 1,
          stateMachinePrefix: "cardano-utxo-rpc-generic",
          predicate: {
            match: {
              cardano: {
                has_address: {
                  exact_address: "cD0ktC/NQ3j7hUmyY1iMF3lu2gFFPU+MCRxVFYw="
                }
              }
            }
          },
        }),
      );
    }
    return b;
  })
  .build();
