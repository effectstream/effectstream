import {
  FileStorage,
  type PaimaBatcherConfig,
  PaimaL2DefaultAdapter,
} from "@paima/batcher";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";

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
const paimaL2 = new PaimaL2DefaultAdapter(
  paimaL2Address,
  batcherPrivateKey,
  paimaL2Fee,
  paimaSyncProtocolName,
);

// Batcher config matching old behavior
export const config: PaimaBatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  adapters: { paimaL2 },
  defaultTarget: "paimaL2",
  namespace: "", // TODO start using namespace for signature verification security
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-paima-processed",
  enableEventSystem: true, // Important for adding state transitions to console logs
  port,
};

export const storage = new FileStorage("./batcher-data");
