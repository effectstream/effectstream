import { contractAddressesEvmMain } from "@evm-midnight/contracts-evm";
import * as CounterContract from "@evm-midnight/midnight-contract/contract";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  PrimitiveTypeEVMERC721,
  PrimitiveTypeMidnightGeneric,
} from "@effectstream/sm/builtin";
import { arbitrum } from "viem/chains";

const EVM_RPC_URL = process.env.EVM_RPC_URL;
if (!EVM_RPC_URL) {
  throw new Error("EVM_RPC_URL is required for mainnet");
}

const EVM_START_BLOCK = Number(process.env.EVM_START_BLOCK);
if (!process.env.EVM_START_BLOCK || Number.isNaN(EVM_START_BLOCK)) {
  throw new Error("EVM_START_BLOCK is required for mainnet (numeric)");
}

const MIDNIGHT_START_BLOCK = Number(process.env.MIDNIGHT_START_BLOCK);
if (!process.env.MIDNIGHT_START_BLOCK || Number.isNaN(MIDNIGHT_START_BLOCK)) {
  throw new Error("MIDNIGHT_START_BLOCK is required for mainnet (numeric)");
}

if (midnightNetworkConfig.id !== "mainnet") {
  throw new Error(
    `Expected Midnight networkId 'mainnet', got '${midnightNetworkConfig.id}'`,
  );
}

type ContractAddressBook = Record<string, Record<string, `0x${string}`>>;
const contractAddressBook = contractAddressesEvmMain() as ContractAddressBook;
const erc721ContractAddress =
  contractAddressBook["chain42161"]?.["Erc721DevModule#Erc721Dev"];
if (!erc721ContractAddress) {
  throw new Error("ERC721 contract address not found for chain42161");
}

const midnightCounterAddress = readMidnightContract(
  "contract-round-value",
  { networkId: "mainnet" },
).contractAddress;

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

if (process.env.NTP_START_TIME) {
  launchStartTime = Number(process.env.NTP_START_TIME);
  if (Number.isNaN(launchStartTime)) {
    throw new Error("NTP_START_TIME must be a numeric timestamp (ms)");
  }
} else {
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
    // DB not initialized yet
  }
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("evm-midnight-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addViemNetwork({
        ...arbitrum,
        rpcUrls: {
          default: {
            http: [EVM_RPC_URL],
          },
        },
        name: "evmMain",
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: midnightNetworkConfig.id,
        nodeUrl: midnightNetworkConfig.node,
      })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        () => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => networks.evmMain,
        (network) => ({
          name: "mainEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: EVM_START_BLOCK,
          pollingInterval: 1000,
          stepSize: 30,
          confirmationDepth: 1,
        }),
      )
      .addParallel(
        (networks) => networks.midnight,
        () => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: MIDNIGHT_START_BLOCK,
          pollingInterval: 6000,
          delayMs: 60000,
          stepSize: 2,
          indexer: midnightNetworkConfig.indexer,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        () => ({
          name: "Arbitrum_ERC721",
          type: PrimitiveTypeEVMERC721,
          startBlockHeight: 0,
          contractAddress: erc721ContractAddress,
          stateMachinePrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        () => ({
          name: "MidnightContractState",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: midnightCounterAddress,
          stateMachinePrefix: "midnightContractState",
          contract: { ledger: CounterContract.ledger },
          networkId: midnightNetworkConfig.id,
        }),
      )
  )
  .build();
