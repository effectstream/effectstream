import { contractAddressesEvmMain } from "@[scope]/evm-contracts";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";

/** EVM-IMPORT-BLOCK */
/** MIDNIGHT-IMPORT-BLOCK */

import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";
import { hardhat } from "viem/chains";
import { getConnection } from "@paimaexample/db";

import {
  PrimitiveTypeAvailGeneric,
  PrimitiveTypeEVMERC1155,
  PrimitiveTypeEVMERC20,
  PrimitiveTypeEVMERC721,
  PrimitiveTypeEVMPaimaL2,
  PrimitiveTypeMidnightGeneric,
} from "@paimaexample/sm/builtin";

/**
 * Let check if the db.
 * If empty then the db is not initialized, and use the current time for the NTP sync.
 * If not, we recreate the original state configuration.
 */

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
const dbConn = getConnection();
try {
  // TODO Update to effectstream.sync_protocol_pagination
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

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("[scope]"),
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
      /** EVM-BLOCK */
      .addViemNetwork({
        ...hardhat,
        name: "evmMain",
      })
      /** EVM-BLOCK */
      
      /** MIDNIGHT-BLOCK */
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        genesisHash:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        networkId: 0,
        nodeUrl: "http://127.0.0.1:9944",
      })
      /** MIDNIGHT-BLOCK */
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
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      /** EVM-BLOCK */
      .addParallel((networks) => networks.evmMain, (network, deployments) => ({
        name: "mainEvmRPC",
        type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
        chainUri: network.rpcUrls.default.http[0],
        startBlockHeight: 1,
        pollingInterval: 500,
        confirmationDepth: 1,
      }))
      /** EVM-BLOCK */

      /** MIDNIGHT-BLOCK */
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
      /** MIDNIGHT-BLOCK */
  )
  .buildPrimitives((builder) =>
    builder
      /** EVM-PRIMITIVE-BLOCK */
      
      /** MIDNIGHT-PRIMITIVE-BLOCK */
  )
  .build();
