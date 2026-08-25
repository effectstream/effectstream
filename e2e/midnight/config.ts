import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import {
  midnightNetworkConfig,
} from "@effectstream/midnight-contracts/midnight-env";
import { getConnection } from "@effectstream/db";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeMidnightNullifierAndCommitment,
  PrimitiveTypeMidnightUnshieldedCreate,
  PrimitiveTypeMidnightUnshieldedSpend,
  PrimitiveTypeMidnightZswapRoot,
  PrimitiveTypeMidnightTokenMint,
} from "@effectstream/sm/builtin";
import * as CounterContract from "@e2e/midnight-contract-counter-basic/contract";
import * as SimpleTokenContract from "@e2e/midnight-contract-eip-20/contract";

/**
 * Recover NTP start time from DB if this is a restart,
 * otherwise use the current wall-clock time.
 */
const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

if (typeof process !== "undefined") {
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
    // DB not initialized yet -- use current time below
  }
}

// -- Read deployed contract addresses ----------------------------------------

const counterAddress = readMidnightContract(
  "contract-counter",
  { networkId: midnightNetworkConfig.id },
).contractAddress;

const eip20Address = readMidnightContract(
  "contract-eip-20",
  { networkId: midnightNetworkConfig.id },
).contractAddress;

// -- Build config -------------------------------------------------------------

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("e2e-midnight"),
  )
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
        (networks) => (networks as any).midnight,
        (network, deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 18000,
          indexer: midnightNetworkConfig.indexer,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
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
          // Fields must be listed in Compact declaration order — the schema is
          // matched positionally against the ledger array, so a missing field
          // shifts every field after it onto the wrong ledger slot.
          ledgerSchema: {
            round: "uint128",
            round_: "uint64",
            entries: { type: "map", value: "uint128" },
            map_of_map: { type: "map", value: { type: "map", value: "uint128" } },
          },
        }),
      )
      .addPrimitive(
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
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "Midnight-NullifierAndCommitment",
          type: PrimitiveTypeMidnightNullifierAndCommitment,
          startBlockHeight: 1,
          stateMachinePrefix: "midnightZswapEventState",
          // capture: "both" is the default; set "nullifiers" or "commitments" to filter
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "Midnight-UnshieldedCreate",
          type: PrimitiveTypeMidnightUnshieldedCreate,
          startBlockHeight: 1,
          stateMachinePrefix: "midnightUnshieldedCreateState",
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "Midnight-UnshieldedSpend",
          type: PrimitiveTypeMidnightUnshieldedSpend,
          startBlockHeight: 1,
          stateMachinePrefix: "midnightUnshieldedSpendState",
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "Midnight-ZswapRoot",
          type: PrimitiveTypeMidnightZswapRoot,
          startBlockHeight: 1,
          stateMachinePrefix: "midnightZswapRootState",
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "Midnight-TokenMint",
          type: PrimitiveTypeMidnightTokenMint,
          startBlockHeight: 1,
          // Both paths at once: the primitive owns its registry table (persist
          // defaults true, populated by the primitive_accounting trigger) AND
          // still dispatches to the state machine — an owned table never
          // suppresses STM input.
          stateMachinePrefix: "midnightTokenMintState",
          networkId: midnightNetworkConfig.id,
        }),
      )
  )
  .build();
