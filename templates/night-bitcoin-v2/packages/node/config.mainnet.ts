// TODO: Mainnet support is not yet wired up for night-bitcoin.
// This stub mirrors the dev config but reads endpoints/start blocks from env vars.
// When mainnet is available:
//   - Pin Midnight networkId to "mainnet" and assert it matches
//     `midnightNetworkConfig.id` at startup.
//   - Replace the regtest Bitcoin endpoint with a real RPC URL/auth pair
//     (set via `BITCOIN_RPC_URL`, `BITCOIN_RPC_USER`, `BITCOIN_RPC_PASS`).
//   - Validate `MIDNIGHT_START_BLOCK` and `BITCOIN_START_BLOCK`.
//   - Tune polling intervals, delayMs, stepSize, and confirmationDepth for
//     production load (see `templates/evm-midnight-v2/packages/node/config.mainnet.ts`).
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
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
  PrimitiveTypeMidnightUnshieldedSpend,
  PrimitiveTypeBitcoinAddress,
} from "@effectstream/sm/builtin";
import type { BlockNumber } from "@effectstream/utils";

const BITCOIN_RPC_URL = process.env.BITCOIN_RPC_URL;
if (!BITCOIN_RPC_URL) {
  throw new Error("BITCOIN_RPC_URL is required for mainnet");
}

const BITCOIN_RPC_USER = process.env.BITCOIN_RPC_USER;
const BITCOIN_RPC_PASS = process.env.BITCOIN_RPC_PASS;
if (!BITCOIN_RPC_USER || !BITCOIN_RPC_PASS) {
  throw new Error(
    "BITCOIN_RPC_USER and BITCOIN_RPC_PASS are required for mainnet",
  );
}

const BITCOIN_START_BLOCK = Number(process.env.BITCOIN_START_BLOCK);
if (!process.env.BITCOIN_START_BLOCK || Number.isNaN(BITCOIN_START_BLOCK)) {
  throw new Error("BITCOIN_START_BLOCK is required for mainnet (numeric)");
}

const MIDNIGHT_START_BLOCK = Number(process.env.MIDNIGHT_START_BLOCK);
if (!process.env.MIDNIGHT_START_BLOCK || Number.isNaN(MIDNIGHT_START_BLOCK)) {
  throw new Error("MIDNIGHT_START_BLOCK is required for mainnet (numeric)");
}

const SYSTEM_WALLET_BTC = process.env.SYSTEM_WALLET_BTC;
if (!SYSTEM_WALLET_BTC) {
  throw new Error("SYSTEM_WALLET_BTC is required for mainnet");
}

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
    if (result?.rows.length) {
      launchStartTime =
        result.rows[0].page.root - result.rows[0].page_number * 1000;
    }
  } catch {
    // DB not initialized yet
  }
}

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("night-bitcoin"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: midnightNetworkConfig.id,
        nodeUrl: midnightNetworkConfig.node,
      })
      .addNetwork({
        name: "bitcoin",
        type: ConfigNetworkType.BITCOIN,
        rpcUrl: BITCOIN_RPC_URL,
        rpcAuth: {
          username: BITCOIN_RPC_USER,
          password: BITCOIN_RPC_PASS,
        },
        network: "mainnet",
        chainIdentifier: "mainnet",
      }),
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
      .addParallel(
        (networks) => networks.bitcoin,
        () => ({
          name: "parallelBitcoin",
          type: ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
          rpcUrl: BITCOIN_RPC_URL,
          startBlockHeight: BITCOIN_START_BLOCK as BlockNumber,
          delayMs: 60000,
          pollingInterval: 30_000,
          confirmationDepth: 6,
        }),
      ),
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        () => ({
          name: "MidnightContractState-ERC20",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: readMidnightContract("unshielded-erc20", {
            networkId: midnightNetworkConfig.id,
          }).contractAddress,
          stateMachinePrefix: "midnightContractStateERC20",
          contract: { ledger: UnshieldedErc20Contract.ledger },
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        () => ({
          name: "MidnightContractState-ERC7683",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: readMidnightContract("erc7683", {
            networkId: midnightNetworkConfig.id,
          }).contractAddress,
          stateMachinePrefix: "midnightContractStateERC7683",
          contract: { ledger: Erc7683Contract.ledger },
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelBitcoin,
        () => ({
          name: "BitcoinAddress",
          type: PrimitiveTypeBitcoinAddress,
          startBlockHeight: BITCOIN_START_BLOCK,
          watchAddress: SYSTEM_WALLET_BTC,
          stateMachinePrefix: "bitcoin-transaction",
        }),
      )
      // Detect native unshielded UTXO spends on Midnight (not contract events).
      // Used to observe M20 transfers from the user to the filler that go via
      // the balancing batcher (Lace's makeTransfer + payFees:false), since
      // those don't fire any contract-state event.
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        () => ({
          name: "Midnight-UnshieldedSpend",
          type: PrimitiveTypeMidnightUnshieldedSpend,
          startBlockHeight: 1,
          stateMachinePrefix: "midnight-unshielded-spend",
          networkId: midnightNetworkConfig.id,
        }),
      ),
  )
  .build();
