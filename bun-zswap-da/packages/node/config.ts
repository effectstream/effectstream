import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeCelestiaGeneric,
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeMidnightNullifier,
} from "@effectstream/sm/builtin";
import type { BlockNumber } from "@effectstream/utils";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { OfferFilesContract } from "../midnight-contracts/contract-offer-files/src/index.ts";

import { getEnv } from "@effectstream/utils/runtime";
// This cannot be imported in the browser
import { getConnection } from "@effectstream/db";

export const CELESTIA_RPC_URL = getEnv("CELESTIA_RPC_URL") ?? "http://127.0.0.1:26658";
export const CELESTIA_NAMESPACE = getEnv("CELESTIA_NAMESPACE") ?? "000000000000deadbeef";
export const CELESTIA_FEE = parseInt(getEnv("CELESTIA_FEE") ?? "2000");
export const CELESTIA_GAS_LIMIT = parseInt(getEnv("CELESTIA_GAS_LIMIT") ?? "100000");
export const CELESTIA_AUTH_TOKEN = getEnv("CELESTIA_AUTH_TOKEN") ?? "";
export const CELESTIA_NETWORK = getEnv("CELESTIA_NETWORK") ?? "devnet";
export const CELESTIA_START_HEIGHT = getEnv("CELESTIA_START_HEIGHT");
// Sync poll cadence. Mainnet public gRPC endpoints rate-limit aggressively;
// 30s (≈2.5 blocks) is safe and cuts call volume ~5x vs the 6s devnet default.
export const CELESTIA_POLLING_INTERVAL_MS = parseInt(
  getEnv("CELESTIA_POLLING_INTERVAL_MS") ??
    (CELESTIA_NETWORK === "mainnet" ? "30000" : "6000"),
);

// celestia-node v0.30+ TxConfig. Each explicit field removes one consensus-gRPC
// call from the submit path (gas estimator / min-gas-price query).
// Leave unset to let the node auto-estimate.
const _gasPrice = getEnv("CELESTIA_GAS_PRICE");
const _gas = getEnv("CELESTIA_GAS");
const _maxGasPrice = getEnv("CELESTIA_MAX_GAS_PRICE");
const _txPriority = getEnv("CELESTIA_TX_PRIORITY");
export const CELESTIA_GAS_PRICE = _gasPrice ? parseFloat(_gasPrice) : undefined;
export const CELESTIA_GAS = _gas ? parseInt(_gas) : undefined;
export const CELESTIA_MAX_GAS_PRICE = _maxGasPrice ? parseFloat(_maxGasPrice) : undefined;
export const CELESTIA_TX_PRIORITY = _txPriority ? parseInt(_txPriority) : undefined;

// Offer lifetime before the TTL-cleanup scheduled input archives it.
// Defaults to 7 days.
export const OFFER_TTL_SECONDS = parseInt(
  getEnv("OFFER_TTL_SECONDS") ?? String(7 * 24 * 60 * 60),
);

export const midnightContract = (() => {
  try {
    return readMidnightContract("contract-offer-files", {
      baseDir: new URL("../midnight-contracts/", import.meta.url).pathname,
      networkId: midnightNetworkConfig.id,
    });
  } catch (error) {
    console.error("[Midnight contract read error]", error);
    return null;
  }
})();

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;

let celestiaStartHeight: number = 1;
if (typeof process !== "undefined") {
  if (CELESTIA_START_HEIGHT) {
    celestiaStartHeight = parseInt(CELESTIA_START_HEIGHT);
  } else if (CELESTIA_NETWORK === "mainnet") {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (CELESTIA_AUTH_TOKEN) headers["Authorization"] = `Bearer ${CELESTIA_AUTH_TOKEN}`;
      const res = await fetch(CELESTIA_RPC_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "header.NetworkHead", params: [] }),
      });
      const json = await res.json();
      if (json.error) throw new Error(JSON.stringify(json.error));
      celestiaStartHeight = parseInt(json.result.header.height, 10);
      console.log(`[Celestia] Starting mainnet sync at head height ${celestiaStartHeight}`);
    } catch (e) {
      console.error("[Celestia] Failed to fetch mainnet head, falling back to height 1:", e);
    }
  }
}

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
    // This is not an error.
    // Do nothing, the DB has not been initialized yet.
  }
}

export const localhostConfig = new ConfigBuilder()
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
        (_network, _deployments) => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).midnight,
        (_network, _deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 18000,
          indexer: midnightNetworkConfig.indexer,
          indexerWs: midnightNetworkConfig.indexerWS,
        }),
      )
      .addParallel(
        (networks) => (networks as any).celestia,
        (_network, _deployments) => ({
          name: "parallelCelestia",
          type: ConfigSyncProtocolType.CELESTIA_PARALLEL,
          startBlockHeight: celestiaStartHeight as BlockNumber,
          // Celestia block time is ~12s. Mainnet defaults to 30s polling to
          // stay under public gRPC rate limits; devnet keeps the tight 6s.
          pollingInterval: CELESTIA_POLLING_INTERVAL_MS,
          delayMs: 12_000,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) => {
    return builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelCelestia,
      (_network, _deployments, _syncProtocol) => ({
        name: "ZswapBlob",
        type: PrimitiveTypeCelestiaGeneric,
        startBlockHeight: celestiaStartHeight,
        namespace: CELESTIA_NAMESPACE,
        stateMachinePrefix: "celestia-zswap",
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      (_network, _deployments, _syncProtocol) => ({
        name: "ZswapMidnightState",
        type: PrimitiveTypeMidnightGeneric,
        startBlockHeight: 1,
        contractAddress: midnightContract!.contractAddress,
        stateMachinePrefix: "midnight-zswap",
        contract: { ledger: OfferFilesContract.ledger },
        networkId: midnightNetworkConfig.id,
      }),
    ).addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelMidnight,
      (_network, _deployments, _syncProtocol) => ({
        name: "Midnight-Nullifier",
        type: PrimitiveTypeMidnightNullifier,
        startBlockHeight: 1,
        stateMachinePrefix: "midnight-nullifier",
        networkId: midnightNetworkConfig.id,
      }),
    );
  })
  .build();
