import { MidnightBalancingAdapter } from "@effectstream/batcher-sdk";
import type { BatcherConfig } from "./config.ts";

export function createMidnightBalancingAdapter(
  batcherConfig: BatcherConfig,
): MidnightBalancingAdapter {
  return new MidnightBalancingAdapter(batcherConfig.walletSeed, {
    indexer: batcherConfig.midnight.indexer,
    indexerWS: batcherConfig.midnight.indexerWS,
    node: batcherConfig.midnight.node,
    proofServer: batcherConfig.midnight.proofServer,
    walletNetworkId: batcherConfig.midnight.id,
    syncProtocolName: "parallelMidnight",
  });
}
