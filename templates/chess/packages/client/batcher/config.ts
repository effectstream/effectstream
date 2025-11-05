import {
  FileStorage,
  type BatcherConfig,
  PaimaL2DefaultAdapter,
} from "@paimaexample/batcher";
import { contractAddressesEvmMain } from "@chess/evm-contracts";

const batchIntervalMs = 1000;
const paimaL2Address = contractAddressesEvmMain()["chain31337"][
  "PaimaL2ContractModule#MyPaimaL2Contract"
] as `0x${string}`;
const paimaSyncProtocolName = "mainEvmRPC";
const batcherPrivateKey =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const paimaL2Fee = 0n; // Old batcher defaulted to 0 for local dev
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

const paimaL2 = new PaimaL2DefaultAdapter(
  paimaL2Address,
  batcherPrivateKey,
  paimaL2Fee,
  paimaSyncProtocolName,
);

export const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  adapters: { paimaL2 },
  defaultTarget: "paimaL2",
  namespace: "",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  // TODO: rename to wait-effectstream-processed
  confirmationLevel: "wait-effectstream-processed", // Connector expectation
  enableEventSystem: true,
  port,
};

export const storage = new FileStorage("./batcher-data");
