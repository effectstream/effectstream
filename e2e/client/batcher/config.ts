import {
  FileStorage,
  type BatcherConfig,
  type DefaultBatcherInput,
  PaimaL2DefaultAdapter,
  MidnightAdapter,
} from "@effectstream/batcher";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@e2e/midnight-contracts/eip-20";

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

const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract("contract-eip-20", "contract-eip-20.json");
const midnightAdapterConfig = {
  indexer: "http://localhost:8088/api/v1/graphql",
  indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
  node: "http://localhost:9944",
  proofServer: "http://localhost:6300",
  zkConfigPath,
  privateStateStoreName: "simpletoken-private-state", // Local LevelDB store
  privateStateId: "simpletokenPrivateState", // On-chain contract ID (must match deploy.ts)
}
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";
export const midnightAdapter = new MidnightAdapter(
  contractAddress,
  GENESIS_MINT_WALLET_SEED,
  midnightAdapterConfig,
  new SimpleToken.Contract(witnesses),
  witnesses,
  contractInfo,
  0, // NetworkId.Undeployed,
  "parallelMidnight",
);

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
