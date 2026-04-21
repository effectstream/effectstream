import { EffectstreamL2DefaultAdapter } from "@effectstream/batcher";
import { contractAddressesEvmMain } from "@e2e-v2/evm-contracts";
import { getEnv } from "@effectstream/utils/runtime";
import * as chains from "viem/chains";

const effectstreamL2Address = contractAddressesEvmMain()["chain31337"][
  "PaimaL2ContractModule#MyPaimaL2Contract"
] as `0x${string}`;

// Use hardhat wallet #2 as the batcher signing key (wallet #0 and #1 are used by tests)
const batcherPrivateKey = (getEnv("BATCHER_EVM_SECRET_KEY") ??
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as `0x${string}`;
const syncProtocolName = "parallelEvmRPC_fast";

export const effectstreamL2Adapter = new EffectstreamL2DefaultAdapter(
  effectstreamL2Address,
  batcherPrivateKey,
  0n, // fee
  syncProtocolName,
  chains.hardhat,
);
