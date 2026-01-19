import { contractAddressesEvmMain } from "@example-evm-midnight/evm-contracts";
import * as CounterContract from "@example-evm-midnight/my-midnight-contract/contract";
import { getConnection } from "@paimaexample/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@paimaexample/midnight-contracts/midnight-env";
import {
  PrimitiveTypeEVMERC721,
  PrimitiveTypeMidnightGeneric,
} from "@paimaexample/sm/builtin";
import { hardhat } from "viem/chains";

/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
let midnightTip: number = 437152;

type ContractAddressBook = Record<string, Record<string, `0x${string}`>>;
const contractAddressBook = contractAddressesEvmMain() as ContractAddressBook;
const erc721LocalContractAddress =
  contractAddressBook["chain31337"]?.["Erc721DevModule#Erc721Dev"] || "0x0000000000000000000000000000000000000000";

const midnightNetworkInputsValid = Boolean(
  midnightNetworkConfig.indexer &&
    midnightNetworkConfig.indexerWS &&
    midnightNetworkConfig.node,
);

let midnightCounterAddress: string | undefined;
let midnightArtifactsReady = false;

if (Deno) {
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
        "contract-round-value",
        { networkId: midnightNetworkConfig.id },
      );
      midnightCounterAddress = counterContract.contractAddress;
      midnightArtifactsReady = Boolean(midnightCounterAddress);
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
    (builder: any) => builder.setSecurityNamespace("evm-midnight-node"),
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
        ...hardhat,
        rpcUrls: {
          default: {
            http: ["http://localhost:8545"],
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
          startBlockHeight: 0,
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
          name: "Arbitrum_ERC721",
          type: PrimitiveTypeEVMERC721,
          startBlockHeight: 0,
          contractAddress: erc721LocalContractAddress,
          stateMachinePrefix: "transfer-assets",
        }),
      );

    if (midnightArtifactsReady) {
      primitivesBuilder = primitivesBuilder
        .addPrimitive(
          (syncProtocols: any) =>
            (syncProtocols as any).parallelMidnight,
          () => ({
            name: "MidnightContractState",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: midnightCounterAddress!,
            stateMachinePrefix: "midnightContractState",
            contract: { ledger: CounterContract.ledger },
            networkId: midnightNetworkConfig.id,
          }),
        );
    }

    return primitivesBuilder;
  })
  .build();
