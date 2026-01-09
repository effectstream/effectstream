import {
  FileStorage,
  type BatcherConfig,
  type DefaultBatcherInput,
  PaimaL2DefaultAdapter,
  MidnightAdapter,
  BitcoinAdapter,
} from "@effectstream/batcher";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@e2e/midnight-contracts/eip-20";
import { dirname, resolve } from "@std/path";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

// Resolve the base directory for midnight contracts
const currentDir = dirname(new URL(import.meta.url).pathname);
const midnightContractsDir = resolve(currentDir, "..", "..", "shared", "contracts", "midnight");

// Config values mirroring e2e/client/node/scripts/start.ts
const batchIntervalMs = 1000;
const paimaL2Address = contractAddressesEvmMain()["chain31337"][
  "PaimaL2ContractModule#MyPaimaL2Contract"
] as `0x${string}`;
const paimaSyncProtocolName = "parallelEvmRPC_fast";
// In real cases use Deno.env for reading private key
const batcherPrivateKey =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

// Defaults consistent with E2E usage
const paimaL2Fee = 0n; // old batcher defaulted to 0 for local dev
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

// PaimaL2 EVM adapter
export const paimaL2Adapter = new PaimaL2DefaultAdapter(
  paimaL2Address,
  batcherPrivateKey,
  paimaL2Fee,
  paimaSyncProtocolName,
);

const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract(
  "contract-eip-20",
  {
    baseDir: midnightContractsDir,
    networkId: midnightNetworkConfig.id,
  },
);
const midnightAdapterConfig = {
  indexer: midnightNetworkConfig.indexer,
  indexerWS: midnightNetworkConfig.indexerWS,
  node: midnightNetworkConfig.node,
  proofServer: midnightNetworkConfig.proofServer,
  zkConfigPath,
  privateStateStoreName: "simpletoken-private-state", // Local LevelDB store
  // Keep in sync with deploy + interact scripts
  privateStateId: "simpleTokenPrivateState", // On-chain contract ID (must match deploy.ts)
  walletNetworkId: midnightNetworkConfig.id, // lowercase is the standard format
}
const DEFAULT_WALLET_SEED = midnightNetworkConfig.walletSeed!;
export const midnightAdapter = new MidnightAdapter(
  contractAddress,
  DEFAULT_WALLET_SEED,
  midnightAdapterConfig,
  new SimpleToken.Contract(witnesses),
  witnesses,
  contractInfo,
  "parallelMidnight",
);

// Bitcoin Adapter
const BITCOIN_SEED = "my-super-secret-regtest-demo-seed-e2e";
export const bitcoinAdapter = new BitcoinAdapter({
  rpcUrl: "http://127.0.0.1:18443",
  rpcUser: "dev",
  rpcPass: "devpassword",
  seed: BITCOIN_SEED,
});

// Batcher config matching old behavior
export const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  namespace: "", // TODO start using namespace for signature verification security
  confirmationLevel: "wait-effectstream-processed",
  enableEventSystem: true, // Important for adding state transitions to console logs
  port,
};

export const storage = new FileStorage("./batcher-data");