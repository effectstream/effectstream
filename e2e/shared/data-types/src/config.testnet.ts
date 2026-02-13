import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import * as CounterContract from "@e2e/midnight-contract-counter-basic/contract";
import * as SimpleTokenContract from "@e2e/midnight-contract-eip-20/contract";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  PrimitiveTypeEVMPaimaL2,
  PrimitiveTypeMidnightGeneric,
} from "@effectstream/sm/builtin";
import { arbitrumSepolia } from "viem/chains";
import { getEnv } from "@effectstream/utils/runtime";

import { paimaL2Grammar } from "./grammar.ts";

/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
// Random tips for testing purposes.
let arbSepoliaTip: number = 1111111111;
let midnightTip: number = 1111111;

/**
 * WARNING: This template fetches the current network tip to avoid long sync times
 * when starting the template. In production implementations, you should sync from
 * at least the contract deployment blockheight to ensure all events are captured.
 * Starting from the current tip means historical events will be missed.
 */
// IMPORTANT: For testing purposes. Setting it to true, will
// use a new tip on each restart, making the db inconsistent.
const USE_TESTING_TIP = true;
const arbitrumSepoliaRpc = getEnv("ARBITRUM_SEPOLIA_RPC");

type ContractAddressBook = Record<string, Record<string, `0x${string}`>>;
const contractAddressBook = contractAddressesEvmMain() as ContractAddressBook;
const paimaL2TestnetContractAddress =
  contractAddressBook["chain421614"]["PaimaL2ContractModule#MyPaimaL2Contract"];

const midnightNetworkInputsValid = Boolean(
  midnightNetworkConfig.indexer &&
    midnightNetworkConfig.indexerWS &&
    midnightNetworkConfig.node,
);

let midnightCounterAddress: string | undefined;
let midnightEip20Address: string | undefined;
let midnightArtifactsReady = false;

if (typeof process !== 'undefined') {
  if (USE_TESTING_TIP && arbitrumSepoliaRpc) {
    /* Get the latest block number from the Arbitrum Sepolia chain */
    try {
      const response = await fetch(arbitrumSepoliaRpc, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: [],
        }),
      });
      const data = await response.json();
      arbSepoliaTip = parseInt(data.result, 16);
    } catch (error) {
      console.warn(`[evm] Failed to fetch tip: ${(error as Error).message}`);
    }
  } else if (USE_TESTING_TIP && !arbitrumSepoliaRpc) {
    console.warn(
      "[evm] ARBITRUM_SEPOLIA_RPC is not defined; using static tip override instead.",
    );
  }

  if (midnightNetworkInputsValid) {
    try {
      const response = await fetch(midnightNetworkConfig.indexer, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "query { block { height } }",
          variables: {},
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to query Midnight indexer: ${response.statusText}`,
        );
      }
      const data = await response.json();
      const height = data?.data?.block?.height;
      if (typeof height === "number") {
        midnightTip = height;
      } else if (typeof height === "string") {
        const parsed = Number(height);
        midnightTip = Number.isNaN(parsed) ? 0 : parsed;
      }
    } catch (error) {
      console.warn(
        `[midnight] Failed to fetch tip from indexer: ${
          (error as Error).message
        }`,
      );
    }

    try {
      const counterContract = readMidnightContract(
        "contract-counter",
        { networkId: midnightNetworkConfig.id },
      );
      const eip20Contract = readMidnightContract(
        "contract-eip-20",
        { networkId: midnightNetworkConfig.id },
      );
      midnightCounterAddress = counterContract.contractAddress;
      midnightEip20Address = eip20Contract.contractAddress;
      midnightArtifactsReady = Boolean(
        midnightCounterAddress && midnightEip20Address,
      );
    } catch (error) {
      console.warn(
        `[midnight] Failed to read contract artifacts: ${
          (error as Error).message
        }`,
      );
      midnightArtifactsReady = false;
    }
  }

  const dbConn = getConnection();
  try {
    const result = await dbConn.query(`
      SELECT * FROM effectstream.sync_protocol_pagination 
      WHERE protocol_name = '${mainSyncProtocolName}' 
      ORDER BY page_number ASC
      LIMIT 1
    `);
    if (result && result.rows.length > 0) {
      launchStartTime = result.rows[0].page.root -
        (result.rows[0].page_number * 1000);
    }
  } catch {
    // DB has not been initialized yet.
  }
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder: any) => builder.setSecurityNamespace("example-e2e-test"),
  )
  .buildNetworks((builder: any) => {
    let networksBuilder = builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addViemNetwork({
        ...arbitrumSepolia,
        rpcUrls: {
          default: {
            // @ts-ignore: viem chains expect at least one compile-time RPC URL
            http: [arbitrumSepoliaRpc ?? ""],
          },
        },
        name: "evmParallel_fast",
      });

    if (midnightNetworkInputsValid) {
      networksBuilder = networksBuilder.addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: midnightNetworkConfig.id,
        nodeUrl: midnightNetworkConfig.node,
      });
    }

    return networksBuilder;
  })
  .buildDeployments((builder: any) => builder)
  .buildSyncProtocols((builder: any) => {
    let syncBuilder = builder
      .addMain(
        (networks: any) => networks.ntp,
        () => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 500,
        }),
      )
      .addParallel(
        (networks: any) => networks.evmParallel_fast,
        (network: any) => ({
          name: "parallelEvmRPC_fast",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: arbSepoliaTip,
          pollingInterval: 1000,
          stepSize: 9,
          confirmationDepth: 1,
        }),
      );

    if (midnightNetworkInputsValid) {
      syncBuilder = (syncBuilder as any).addParallel(
        (networks: any) => (networks as any).midnight,
        () => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: midnightTip ?? 1,
          pollingInterval: 2000,
          delayMs: 6000,
          indexer: midnightNetworkConfig.indexer,
          indexerWs: midnightNetworkConfig.indexerWS,
        }),
      );
    }

    return syncBuilder;
  })
  .buildPrimitives((builder: any) => {
    let primitivesBuilder = builder
      .addPrimitive(
        (syncProtocols: any) => syncProtocols.parallelEvmRPC_fast,
        () => ({
          name: "PaimaGameInteraction",
          type: PrimitiveTypeEVMPaimaL2,
          startBlockHeight: 0,
          contractAddress: paimaL2TestnetContractAddress,
          paimaL2Grammar: paimaL2Grammar,
        }),
      );

    if (midnightArtifactsReady) {
      primitivesBuilder = primitivesBuilder
        .addPrimitive(
          (syncProtocols: any) =>
            (syncProtocols as any).parallelMidnightTestnet,
          () => ({
            name: "MidnightContractState",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: midnightCounterAddress!,
            stateMachinePrefix: "midnightContractState",
            contract: { ledger: CounterContract.ledger },
            networkId: midnightNetworkConfig.id,
          }),
        )
        .addPrimitive(
          (syncProtocols: any) =>
            (syncProtocols as any).parallelMidnightTestnet,
          () => ({
            name: "Midnight-EIP-20",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: midnightEip20Address!,
            stateMachinePrefix: "eip20ContractState",
            contract: { ledger: SimpleTokenContract.ledger },
            networkId: midnightNetworkConfig.id,
          }),
        );
    }

    return primitivesBuilder;
  })
  .build();
