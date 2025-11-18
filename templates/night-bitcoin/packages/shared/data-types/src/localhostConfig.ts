// import { contractAddressesEvmMain } from "@night-bitcoin/evm-contracts";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
// import { contractAddressesEvmMain } from "@e2e/evm-contracts";
// import { readAvailApplication } from "@e2e/avail-contracts";
import { getConnection } from "@paimaexample/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";
// import { hardhat } from "viem/chains";
// import type { BlockNumber } from "@paimaexample/utils";
// import { paimaL2Grammar } from "./grammar.ts";
import {
  PrimitiveTypeMidnightGeneric,
} from "@paimaexample/sm/builtin";
import * as UnshieldedErc20Contract from "@night-bitcoin/midnight-contract-unshielded-erc20/contract";
import * as Erc7683Contract from "@night-bitcoin/midnight-contract-erc7683/contract";


      
const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

if (Deno) {
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
}

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("example-e2e-test"),
  )
  .buildNetworks((builder) => {
    return builder
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
      .addNetwork({
          name: "midnight",
          type: ConfigNetworkType.MIDNIGHT,
          genesisHash:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          networkId: 0, // NetworkId.Undeployed,
          nodeUrl: "http://127.0.0.1:9944",
        });
      // TODO ADD BITCOIN .addNetwork
  })
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) => {
    return builder
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
      // TODO ADD BITCOIN .addParallel
  })
  .buildPrimitives((builder) =>
    builder
        .addPrimitive(
          (syncProtocols) => syncProtocols.parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "MidnightContractState-ERC20",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: readMidnightContract("unshielded-erc20", "contract-unshielded-erc20.json").contractAddress,
            stateMachinePrefix: "midnightContractStateERC20",
            contract: { ledger: UnshieldedErc20Contract.ledger },
            networkId: 0,
          })
        )
      

        .addPrimitive(
          (syncProtocols) => syncProtocols.parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "MidnightContractState-ERC7683",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: readMidnightContract("erc7683", "contract-erc7683.json").contractAddress,
            stateMachinePrefix: "midnightContractStateERC7683",
            contract: { ledger: Erc7683Contract.ledger },
            networkId: 0,
          })
        )
  )
  .build();
