import { PaimaL2DefaultAdapter } from "@effectstream/batcher";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { ENV } from "@effectstream/utils/node-env";
import * as chains from "viem/chains";
import { Chain } from "viem";

// This file loads either a local hardhat chain contract or a testnet contract.
//
// Config values mirroring e2e/client/node/scripts/start.{env}.ts
const isTestnet = ENV.EFFECTSTREAM_ENV === "testnet";
const chainNameId = 'chain' + (isTestnet ? 421614 : 31337);
const paimaSyncProtocolName = "parallelEvmRPC_fast";

const paimaL2Address = contractAddressesEvmMain()[chainNameId]["PaimaL2ContractModule#MyPaimaL2Contract"] as `0x${string}`;

const batcherPrivateKey = ENV.getString(
  "BATCHER_EVM_SECRET_KEY"
) as `0x${string}`;

// Defaults consistent with E2E usage
const paimaL2Fee = 0n; // old batcher defaulted to 0 for local dev

let chain: Chain;
if (isTestnet) {
  chain = chains.arbitrumSepolia;
  chain.rpcUrls = {
    default: {
      http: [ENV.getString("ARBITRUM_SEPOLIA_RPC")],
    },
  };
} else {
  chain = chains.hardhat;
}

// PaimaL2 EVM adapter
export const effectstreaml2Adapter = new PaimaL2DefaultAdapter(
  paimaL2Address,
  batcherPrivateKey,
  paimaL2Fee,
  paimaSyncProtocolName,
  chain
);
