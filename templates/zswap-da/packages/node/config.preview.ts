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
  PrimitiveTypeMidnightUnshieldedCreate,
  PrimitiveTypeMidnightZswapRoot,
} from "@effectstream/sm/builtin";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { OfferFilesContract } from "@zswap-da/contract-offer-files";

import {
  CELESTIA_NAMESPACE,
  CELESTIA_POLLING_INTERVAL_MS,
  CELESTIA_RPC_URL,
  CELESTIA_START_HEIGHT,
  midnightContract,
} from "./env.ts";

const CELESTIA_START_BLOCK = CELESTIA_START_HEIGHT != null ? Number(CELESTIA_START_HEIGHT) : 1;
if (!Number.isFinite(CELESTIA_START_BLOCK)) {
  throw new Error("CELESTIA_START_HEIGHT must be numeric");
}

const contractAddress =
  process.env.MIDNIGHT_CONTRACT_ADDRESS ?? midnightContract?.contractAddress;

if (!contractAddress) {
  throw new Error(
    "No Midnight contract address found for the preview network.\n" +
    "Either:\n" +
    "  1. Set MIDNIGHT_CONTRACT_ADDRESS env var, or\n" +
    "  2. Create packages/contracts-midnight/contract-offer-files.preview.json\n" +
    "     by running deploy.ts with MIDNIGHT_NETWORK_ID=preview.",
  );
}

const MIDNIGHT_START_BLOCK = Number(process.env.MIDNIGHT_START_BLOCK ?? "1");
if (!Number.isFinite(MIDNIGHT_START_BLOCK)) {
  throw new Error("MIDNIGHT_START_BLOCK must be numeric");
}

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("zswap-da-node"))
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
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
          name: "mainNtp",
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
          delayMs: 30_000,
          indexer: midnightNetworkConfig.indexer,
          indexerWs: midnightNetworkConfig.indexerWS,
        }),
      )
      .addParallel(
        (networks) => (networks as any).celestia,
        () => ({
          name: "parallelCelestia",
          type: ConfigSyncProtocolType.CELESTIA_PARALLEL,
          startBlockHeight: CELESTIA_START_BLOCK,
          pollingInterval: CELESTIA_POLLING_INTERVAL_MS,
          delayMs: 12_000,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelCelestia,
        () => ({
          name: "ZswapBlob",
          type: PrimitiveTypeCelestiaGeneric,
          startBlockHeight: CELESTIA_START_BLOCK,
          namespace: CELESTIA_NAMESPACE,
          stateMachinePrefix: "celestia-zswap",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        () => ({
          name: "ZswapMidnightState",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: MIDNIGHT_START_BLOCK,
          contractAddress: contractAddress!,
          stateMachinePrefix: "midnight-zswap",
          contract: { ledger: OfferFilesContract.ledger },
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        () => ({
          name: "Midnight-Nullifier",
          type: PrimitiveTypeMidnightNullifier,
          startBlockHeight: MIDNIGHT_START_BLOCK,
          stateMachinePrefix: "midnight-nullifier",
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        () => ({
          name: "Midnight-UnshieldedSpend",
          type: PrimitiveTypeMidnightUnshieldedSpend,
          startBlockHeight: MIDNIGHT_START_BLOCK,
          stateMachinePrefix: "midnight-unshielded-spend",
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        () => ({
          name: "Midnight-UnshieldedCreate",
          type: PrimitiveTypeMidnightUnshieldedCreate,
          startBlockHeight: MIDNIGHT_START_BLOCK,
          stateMachinePrefix: "midnight-unshielded-create",
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelMidnight,
        () => ({
          name: "Midnight-ZswapRoot",
          type: PrimitiveTypeMidnightZswapRoot,
          startBlockHeight: MIDNIGHT_START_BLOCK,
          stateMachinePrefix: "midnight-zswap-root",
          networkId: midnightNetworkConfig.id,
        }),
      )
  )
  .build();
