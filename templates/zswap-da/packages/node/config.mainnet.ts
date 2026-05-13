import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeCelestiaGeneric,
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeMidnightNullifier,
  PrimitiveTypeMidnightUnshieldedSpend,
} from "@effectstream/sm/builtin";
import type { BlockNumber } from "@effectstream/utils";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { OfferFilesContract } from "@zswap-da/contract-offer-files";
import { getConnection } from "@effectstream/db";

import {
  CELESTIA_AUTH_TOKEN,
  CELESTIA_NAMESPACE,
  CELESTIA_NETWORK,
  CELESTIA_POLLING_INTERVAL_MS,
  CELESTIA_RPC_URL,
  CELESTIA_START_HEIGHT,
  midnightContract,
} from "./env.ts";

if (CELESTIA_NETWORK !== "mainnet") {
  throw new Error(
    `config.mainnet.ts requires CELESTIA_NETWORK=mainnet, got '${CELESTIA_NETWORK}'`,
  );
}
if (!CELESTIA_AUTH_TOKEN) {
  throw new Error("CELESTIA_AUTH_TOKEN is required for mainnet");
}

const MIDNIGHT_START_BLOCK = Number(process.env.MIDNIGHT_START_BLOCK ?? "1");
if (!Number.isFinite(MIDNIGHT_START_BLOCK)) {
  throw new Error("MIDNIGHT_START_BLOCK must be numeric");
}

// Resolve Celestia start height: env override → live network head → 1.
let celestiaStartHeight: number = 1;
if (CELESTIA_START_HEIGHT) {
  celestiaStartHeight = parseInt(CELESTIA_START_HEIGHT);
} else {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CELESTIA_AUTH_TOKEN}`,
    };
    const res = await fetch(CELESTIA_RPC_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "header.NetworkHead",
        params: [],
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    celestiaStartHeight = parseInt(json.result.header.height, 10);
    console.log(
      `[Celestia] Starting mainnet sync at head height ${celestiaStartHeight}`,
    );
  } catch (e) {
    console.error(
      "[Celestia] Failed to fetch mainnet head, falling back to height 1:",
      e,
    );
  }
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
    (builder) => builder.setSecurityNamespace("zswap-da-node"),
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
      .addNetwork({
        name: "celestia",
        type: ConfigNetworkType.CELESTIA,
        rpcUrl: CELESTIA_RPC_URL,
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
        (networks) => (networks as any).midnight,
        () => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: MIDNIGHT_START_BLOCK,
          pollingInterval: 6000,
          delayMs: 60_000,
          indexer: midnightNetworkConfig.indexer,
          indexerWs: midnightNetworkConfig.indexerWS,
        }),
      )
      .addParallel(
        (networks) => (networks as any).celestia,
        () => ({
          name: "parallelCelestia",
          type: ConfigSyncProtocolType.CELESTIA_PARALLEL,
          startBlockHeight: celestiaStartHeight as BlockNumber,
          pollingInterval: CELESTIA_POLLING_INTERVAL_MS,
          delayMs: 12_000,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) => {
    return builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelCelestia,
      () => ({
        name: "ZswapBlob",
        type: PrimitiveTypeCelestiaGeneric,
        startBlockHeight: celestiaStartHeight,
        namespace: CELESTIA_NAMESPACE,
        stateMachinePrefix: "celestia-zswap",
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      () => ({
        name: "ZswapMidnightState",
        type: PrimitiveTypeMidnightGeneric,
        startBlockHeight: MIDNIGHT_START_BLOCK,
        contractAddress: midnightContract!.contractAddress,
        stateMachinePrefix: "midnight-zswap",
        contract: { ledger: OfferFilesContract.ledger },
        networkId: midnightNetworkConfig.id,
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      () => ({
        name: "Midnight-Nullifier",
        type: PrimitiveTypeMidnightNullifier,
        startBlockHeight: MIDNIGHT_START_BLOCK,
        stateMachinePrefix: "midnight-nullifier",
        networkId: midnightNetworkConfig.id,
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      () => ({
        name: "Midnight-UnshieldedSpend",
        type: PrimitiveTypeMidnightUnshieldedSpend,
        startBlockHeight: MIDNIGHT_START_BLOCK,
        stateMachinePrefix: "midnight-unshielded-spend",
        networkId: midnightNetworkConfig.id,
      }),
    );
  })
  .build();
