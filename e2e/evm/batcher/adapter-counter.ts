import {
  EvmContractAdapter,
  type EvmContractAdapterConfig,
} from "@effectstream/batcher-sdk";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import CounterArtifact from "../../shared/contracts/evm/ignition/deployments/chain-31337/artifacts/CounterModule#Counter.json" with { type: "json" };
import { getEnv } from "@effectstream/utils/runtime";

const COUNTER_TARGET = "evmCounter";
const COUNTER_SYNC_PROTOCOL = "parallelEvmRPC_fast";
const COUNTER_ADDRESS = contractAddressesEvmMain()["chain31337"][
  "CounterModule#Counter"
] as `0x${string}`;
const COUNTER_PRIVATE_KEY =
  (getEnv("COUNTER_BATCHER_PRIVATE_KEY") ??
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as `0x${string}`;

const counterConfig: EvmContractAdapterConfig = {
  contractAddress: COUNTER_ADDRESS,
  privateKey: COUNTER_PRIVATE_KEY,
  syncProtocolName: COUNTER_SYNC_PROTOCOL,
  artifact: CounterArtifact,
  maxBatchSize: 10_000,
};

export const counterAdapter = new EvmContractAdapter(counterConfig);
export const counterAdapterTarget = COUNTER_TARGET;
