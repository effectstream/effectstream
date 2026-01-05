import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { arbitrumSepolia } from "viem/chains";

import { paimaL2Grammar } from "./grammar.ts";
import {
  PrimitiveTypeEVMPaimaL2,
} from "@effectstream/sm/builtin";
 
/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
let arbSepoliaTip: number = 230666729;

 // IMPORTANT: For testing purposes. Setting it to true, will 
 // use a new tip on each restart, making the db inconsistent.
const USE_TESTING_TIP = true;

if (Deno) {
  // NOTE: This does not work when imported by the browser.
  //       We setup a Deno as undefined in the browser, to make it skip this import.
  // const { getConnection } = await import("@effectstream/db");
  if (USE_TESTING_TIP) {
    /* Get the latest block number from the Arbitrum Sepolia chain */
    const response = await fetch(Deno.env.get("ARBITRUM_SEPOLIA_RPC"), {
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
  .buildNetworks((builder) => 
    builder
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
            // @ts-ignore
            http: [Deno ? Deno.env.get("ARBITRUM_SEPOLIA_RPC") : ""],
          },
        },
        name: "evmParallel_fast",
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
      )  
  )
  .buildPrimitives((builder) => 
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
        (network, deployments, syncProtocol) =>
          ({
            name: "PaimaGameInteraction",
            type: PrimitiveTypeEVMPaimaL2,
            startBlockHeight: 0,
            contractAddress: contractAddressesEvmMain()["chain421614"][
              "PaimaL2ContractModule#MyPaimaL2Contract"
            ],
            paimaL2Grammar: paimaL2Grammar,
          }),
      )
  )
  .build();
