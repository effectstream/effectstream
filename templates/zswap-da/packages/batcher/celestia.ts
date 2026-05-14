import { CelestiaAdapter } from "@effectstream/batcher-sdk";
import type { BatcherConfig } from "./config.ts";

export function createCelestiaAdapter(
  batcherConfig: BatcherConfig,
): CelestiaAdapter {
  return new CelestiaAdapter({
    rpcUrl: batcherConfig.celestia.rpcUrl,
    namespace: batcherConfig.celestia.namespace,
    authToken: batcherConfig.celestia.authToken,
    network: batcherConfig.celestia.network,
    fee: batcherConfig.celestia.fee,
    gasLimit: batcherConfig.celestia.gasLimit,
    gasPrice: batcherConfig.celestia.gasPrice,
    gas: batcherConfig.celestia.gas,
    maxGasPrice: batcherConfig.celestia.maxGasPrice,
    txPriority: batcherConfig.celestia.txPriority,
    syncProtocolName: "parallelCelestia",
  });
}
