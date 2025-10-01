import {
  EvmChainConnector,
  FileStorage,
  type PaimaBatcherConfig,
} from "@paima/batcher";
import * as chains from "viem/chains";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";

// Config values mirroring e2e/client/node/scripts/start.ts
const batchIntervalMs = 1000;
const paimaL2Address = contractAddressesEvmMain()["chain31337"][
  "PaimaL2ContractModule#MyPaimaL2Contract"
] as `0x${string}`;
const paimaSyncProtocolName = "parallelEvmRPC_fast";
const batcherPrivateKey =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const chain = chains.hardhat;

// Defaults consistent with E2E usage
const paimaL2Fee = 0n; // old batcher defaulted to 0 for local dev
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3334");

// EVM connector
const evm = new EvmChainConnector(
  paimaL2Address,
  batcherPrivateKey,
  chain,
  paimaL2Fee,
  paimaSyncProtocolName,
);

// Batcher config matching old behavior
export const config: PaimaBatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  connectors: { evm },
  defaultTarget: "evm",
  batchingCriteria: {
    evm: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-paima-processed",
  batchBuilding: { maxSize: 10000 },
  port,
};

export const storage = new FileStorage("./batcher-data");
