import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightLedgerFromTxStateHex } from "@effectstream/midnight-contracts/ledger-from-tx-state";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import * as UnshieldedErc20Contract from "@night-bitcoin/midnight-contract-unshielded-erc20/contract";
import * as Erc7683Contract from "@night-bitcoin/midnight-contract-erc7683/contract";
import {
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeBitcoinAddress,
} from "@effectstream/sm/builtin";
import type { BlockNumber } from "@effectstream/utils";

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

const dbConn = getConnection();
try {
  const result = await dbConn.query(`
    SELECT * FROM effectstream.sync_protocol_pagination
    WHERE protocol_name = '${mainSyncProtocolName}'
    ORDER BY page_number ASC
    LIMIT 1
  `);
  if (result?.rows.length) {
    launchStartTime =
      result.rows[0].page.root - result.rows[0].page_number * 1000;
  }
} catch {
  // DB not initialized yet
}

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("night-bitcoin"))
  .buildNetworks((builder) => {
    return builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        // Initial time for the Effectstream Node. Unix Timestamp in milliseconds.
        startTime: launchStartTime ?? new Date().getTime(),
        // Block size in milliseconds, used to sync other chains.
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        genesisHash:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        networkId: midnightNetworkConfig.id,
        nodeUrl: midnightNetworkConfig.node,
      })
      .addNetwork({
        name: "bitcoin",
        type: ConfigNetworkType.BITCOIN,
        rpcUrl: "http://127.0.0.1:18443",
        rpcAuth: {
          username: "dev",
          password: "devpassword",
        },
        network: "regtest",
        chainIdentifier: "regtest",
      });
  })
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) => {
    return builder
      .addMain(
        (networks) => networks.ntp,
        (_network, _deployments) => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 500,
        }),
      )
      .addParallel(
        (networks) => networks.midnight,
        (_network, _deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 18000,
          indexer: midnightNetworkConfig.indexer,
          indexerWS: midnightNetworkConfig.indexerWS,
        }),
      )
      .addParallel(
        (networks) => networks.bitcoin,
        (_network, _deployments) => ({
          name: "parallelBitcoin",
          type: ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:18443",
          startBlockHeight: 0 as BlockNumber,
          delayMs: 20000,
          pollingInterval: 10_000,
          confirmationDepth: 0,
        }),
      );
  })
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        (_network, _deployments, _syncProtocol) => ({
          name: "MidnightContractState-ERC20",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: readMidnightContract(
            "unshielded-erc20",
            { networkId: midnightNetworkConfig.id },
          ).contractAddress,
          stateMachinePrefix: "midnightContractStateERC20",
          contract: {
            ledger: UnshieldedErc20Contract.ledger,
            ledgerFromTxStateHex: midnightLedgerFromTxStateHex(
              UnshieldedErc20Contract.ledger,
              ContractState,
            ),
          },
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        (_network, _deployments, _syncProtocol) => ({
          name: "MidnightContractState-ERC7683",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: readMidnightContract(
            "erc7683",
            { networkId: midnightNetworkConfig.id },
          ).contractAddress,
          stateMachinePrefix: "midnightContractStateERC7683",
          contract: {
            ledger: Erc7683Contract.ledger,
            ledgerFromTxStateHex: midnightLedgerFromTxStateHex(
              Erc7683Contract.ledger,
              ContractState,
            ),
          },
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelBitcoin,
        (_network, _deployments, _syncProtocol) => ({
          name: "BitcoinAddress",
          type: PrimitiveTypeBitcoinAddress,
          startBlockHeight: 101,
          watchAddress: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
          stateMachinePrefix: "bitcoin-transaction",
        }),
      ),
  )
  .build();
