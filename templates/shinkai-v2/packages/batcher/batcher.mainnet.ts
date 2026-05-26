import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig } from "@effectstream/batcher-sdk";
import { EffectstreamL2DefaultAdapter } from "@effectstream/batcher-sdk";
import { arbitrum } from "viem/chains";

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
if (!EVM_PRIVATE_KEY) throw new Error("EVM_PRIVATE_KEY is required for mainnet batcher");

const EFFECTSTREAM_L2_ADDRESS = process.env.EFFECTSTREAM_L2_ADDRESS as `0x${string}`;
if (!EFFECTSTREAM_L2_ADDRESS) throw new Error("EFFECTSTREAM_L2_ADDRESS is required for mainnet batcher");

const ARBITRUM_WRITE_RPC = process.env.ARBITRUM_ONE_FULL;
if (!ARBITRUM_WRITE_RPC) throw new Error("ARBITRUM_ONE_FULL is required for mainnet batcher (write RPC for tx submission)");

const batchIntervalMs = 5000;
const port = Number(process.env.BATCHER_PORT ?? "3334");

// Arbitrum One with the env-provided RPC URL. Writes must hit upstream Alchemy
// (or any full RPC) — the local evm-gateway is read-only and won't accept
// eth_sendRawTransaction.
const arbitrumChain = {
  ...arbitrum,
  rpcUrls: { default: { http: [ARBITRUM_WRITE_RPC] } },
};

const paimaL2 = new EffectstreamL2DefaultAdapter(
  EFFECTSTREAM_L2_ADDRESS,
  EVM_PRIVATE_KEY,
  0n,
  "mainEvmRPC",
  arbitrumChain,
);

const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { paimaL2 },
  defaultTarget: "paimaL2",
  namespace: "shinkai-v2",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);

main(function* () {
  batcher.addStateTransition("startup", ({ publicConfig }) => {
    console.log(`Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms`);
  });

  batcher.addStateTransition("http:start", ({ port }) => {
    console.log(`HTTP Server ready on port ${port}`);
  });

  yield* batcher.runBatcher();
  yield* suspend();
});
