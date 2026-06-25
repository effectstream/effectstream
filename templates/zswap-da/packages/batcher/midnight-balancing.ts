import { MidnightBalancingAdapter } from "@effectstream/batcher-sdk";
import { waitForDustFundsWithRetry } from "@effectstream/midnight-contracts";
import type { BatcherConfig } from "./config.ts";

export function createMidnightBalancingAdapter(
  batcherConfig: BatcherConfig,
): MidnightBalancingAdapter {
  // Why this approach instead of passing a `walletResult` built by buildWalletFacade:
  //
  // Midnight Preview has ~83k historical dust commitment entries. The wallet must
  // scan them all to find recently-registered dust UTXOs. The default path uses
  // stallTimeoutMs=60s and maxRetries=5, covering only ~6k entries before giving up.
  //
  // waitForDustFundsWithRetry with stallTimeoutMs=7_200_000 (2h) lets the entire
  // 81-minute scan finish in a single attempt without a false stall. It also saves
  // state to dust-state/ on disk, so a restart resumes from where it left off
  // (via the batcher_dust Docker volume).
  const firstSeed = Array.isArray(batcherConfig.walletSeed)
    ? batcherConfig.walletSeed[0]!
    : batcherConfig.walletSeed;

  const networkUrls = {
    id: batcherConfig.midnight.id,
    indexer: batcherConfig.midnight.indexer,
    indexerWS: batcherConfig.midnight.indexerWS,
    node: batcherConfig.midnight.node,
    proofServer: batcherConfig.midnight.proofServer,
  };

  const walletResultPromise = waitForDustFundsWithRetry(
    {
      networkUrls: networkUrls as any,
      seed: firstSeed,
      networkId: batcherConfig.midnight.id as any,
      syncMode: "dust-only",
      stallTimeoutMs: 7_200_000,  // 2h per attempt — enough for the full 81-min scan
      maxRetries: 3,
    },
  ).then(({ walletResult }) => walletResult);

  return new MidnightBalancingAdapter([firstSeed], {
    indexer: batcherConfig.midnight.indexer,
    indexerWS: batcherConfig.midnight.indexerWS,
    node: batcherConfig.midnight.node,
    proofServer: batcherConfig.midnight.proofServer,
    walletNetworkId: batcherConfig.midnight.id,
    syncProtocolName: "parallelMidnight",
    walletResult: walletResultPromise as any,
    walletFundingTimeoutSeconds: 7200,
  });
}
