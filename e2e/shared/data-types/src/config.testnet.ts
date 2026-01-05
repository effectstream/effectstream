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
import {
  PrimitiveTypeEVMPaimaL2,
  PrimitiveTypeMidnightGeneric,
} from "@effectstream/sm/builtin";
import { arbitrumSepolia } from "viem/chains";

import { paimaL2Grammar } from "./grammar.ts";
 
/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
let arbSepoliaTip: number = 230666729;
let midnightTip: number | undefined;

 // IMPORTANT: For testing purposes. Setting it to true, will 
 // use a new tip on each restart, making the db inconsistent.
const USE_TESTING_TIP = true;
const arbitrumSepoliaRpc = Deno ? Deno.env.get("ARBITRUM_SEPOLIA_RPC") : undefined;

// Midnight node/indexer live on the remote chain; proof server continues to run locally.
const midnightIndexerHttp = Deno ? Deno.env.get("MIDNIGHT_INDEXER_HTTP") : undefined;
const midnightIndexerWs = Deno ? Deno.env.get("MIDNIGHT_INDEXER_WS") : undefined;
const midnightNodeHttp = Deno ? Deno.env.get("MIDNIGHT_NODE_HTTP") : undefined;
const midnightGenesisHash = Deno
  ? (Deno.env.get("MIDNIGHT_GENESIS_HASH") as `0x${string}` | undefined)
  : undefined;
const midnightNetworkIdRaw = Deno ? Deno.env.get("MIDNIGHT_NETWORK_ID") : undefined;
const midnightNetworkId = midnightNetworkIdRaw !== undefined
  ? Number(midnightNetworkIdRaw)
  : undefined;

type ContractAddressBook = Record<string, Record<string, `0x${string}`>>;
const contractAddressBook = contractAddressesEvmMain() as ContractAddressBook;
const paimaL2TestnetContractAddress =
  contractAddressBook["chain421614"]["PaimaL2ContractModule#MyPaimaL2Contract"];

const midnightNetworkInputsValid = Boolean(
  midnightIndexerHttp && midnightIndexerWs && midnightNodeHttp &&
    midnightGenesisHash && midnightNetworkId !== undefined && !Number.isNaN(midnightNetworkId),
);

let midnightCounterAddress: string | undefined;
let midnightEip20Address: string | undefined;
let midnightArtifactsReady = false;

if (Deno) {
  // NOTE: This does not work when imported by the browser.
  //       We setup a Deno as undefined in the browser, to make it skip this import.
  // const { getConnection } = await import("@effectstream/db");
  if (USE_TESTING_TIP && arbitrumSepoliaRpc) {
    /* Get the latest block number from the Arbitrum Sepolia chain */
    const response = await fetch(arbitrumSepoliaRpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber', // Standard RPC method to get the latest block number
        params: []
      }),
    });
    const data = await response.json();
    arbSepoliaTip = parseInt(data.result, 16);
  } else if (USE_TESTING_TIP && !arbitrumSepoliaRpc) {
    console.warn(
      "[evm] ARBITRUM_SEPOLIA_RPC is not defined; using static tip override instead.",
    );
  }

  if (midnightNetworkInputsValid) {
    try {
      const response = await fetch(midnightIndexerHttp!, {
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
        throw new Error(`Failed to query Midnight indexer: ${response.statusText}`);
      }
      const data = await response.json();
      const height = data?.data?.block?.height;
      if (typeof height === "number") {
        midnightTip = height;
      } else if (typeof height === "string") {
        const parsed = Number(height);
        midnightTip = Number.isNaN(parsed) ? undefined : parsed;
      }
    } catch (error) {
      console.warn(
        `[midnight] Failed to fetch tip from indexer: ${(error as Error).message}`,
      );
    }

    try {
      const counterContract = readMidnightContract(
        "contract-counter",
        "contract.testnet.json",
      );
      const eip20Contract = readMidnightContract(
        "contract-eip-20",
        "contract.testnet.json",
      );
      midnightCounterAddress = counterContract.contractAddress;
      midnightEip20Address = eip20Contract.contractAddress;
      midnightArtifactsReady = Boolean(
        midnightCounterAddress && midnightEip20Address,
      );
    } catch (error) {
      console.warn(
        `[midnight] Failed to read contract artifacts: ${(error as Error).message}`,
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

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("example-e2e-test"),
  )
  .buildNetworks((builder) => {
    let networksBuilder = builder
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
        genesisHash: midnightGenesisHash!,
        networkId: midnightNetworkId!,
        nodeUrl: midnightNodeHttp!,
      });
    }

    return networksBuilder;
  })
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) => {
    let syncBuilder = builder
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
          startBlockHeight: arbSepoliaTip,
          pollingInterval: 1000, // poll quickly to react fast
          stepSize: 9,
          confirmationDepth: 1,
        }),
      );

    if (midnightNetworkInputsValid) {
      // Cast builder since the helper currently narrows additions per parallel type.
      syncBuilder = (syncBuilder as any).addParallel(
        (networks) => (networks as any).midnight,
        () => ({
          name: "parallelMidnightTestnet",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: midnightTip ?? 1,
          pollingInterval: 2000,
          delayMs: 6000, // give the managed indexer a little room
          indexer: midnightIndexerHttp!,
          indexerWs: midnightIndexerWs!,
        }),
      );
    }

    return syncBuilder;
  })
  .buildPrimitives((builder) => {
    let primitivesBuilder = builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
        (network, deployments, syncProtocol) =>
          ({
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
          (syncProtocols) => (syncProtocols as any).parallelMidnightTestnet,
          () => ({
            name: "MidnightContractState",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: midnightCounterAddress!,
            stateMachinePrefix: "midnightContractState",
            contract: { ledger: CounterContract.ledger },
            networkId: midnightNetworkId!,
          }),
        )
        .addPrimitive(
          (syncProtocols) => (syncProtocols as any).parallelMidnightTestnet,
          () => ({
            name: "Midnight-EIP-20",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: midnightEip20Address!,
            stateMachinePrefix: "eip20ContractState",
            contract: { ledger: SimpleTokenContract.ledger },
            networkId: midnightNetworkId!,
          }),
        );
    }

    return primitivesBuilder;
  })
  .build();
