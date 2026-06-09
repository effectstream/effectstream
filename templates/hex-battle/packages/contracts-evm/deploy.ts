import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import * as config from "./hardhat.config.ts";
import EffectstreamL2Module from "./ignition/modules/effectstreamL2.ts";
import type { buildModule } from "@nomicfoundation/ignition-core";

const __dirname: any = import.meta.dirname;

type Deployment = {
  module: ReturnType<typeof buildModule>;
  network: string;
  parameters?: Record<string, Record<string, any>>;
};

// This is the list of contracts to deploy.
// Hex Battle keys off the wallet that submits the L2 input (no per-player NFT),
// so the only contract it needs is the base EffectstreamL2.
const myDeployments: Deployment[] = [
  {
    module: EffectstreamL2Module,
    network: "evmMainHttp",
    parameters: {
      EffectstreamL2Module: {
        owner: "0xEFfE522D441d971dDC7153439a7d10235Ae6301f",
        fee: 0,
      },
    },
  },
] as const;

/**
 * Deploy the contracts to the network.
 */
export async function deploy(): Promise<void> {
  const hre = await createHardhatRuntimeEnvironment(config.default, __dirname);
  const messages: string[] = [];
  for (const deployment of myDeployments) {
    const network = await hre.network.connect(deployment.network);
    const result = await (network as any).ignition.deploy(
      deployment.module,
      deployment.parameters ? { parameters: deployment.parameters } : undefined,
    );
    messages.push(
      `${deployment.module.id.substring(0, 16).padEnd(16)} @ ${
        deployment.network.substring(0, 16).padEnd(16)
      } deployed to ${result.contract.address}`,
    );
  }
  console.log("Deployed contracts:\n", messages.join("\n"));
  // Wait for a block to be minted on the slowest chain.
  await new Promise((r) => setTimeout(r, 1000 * 2));
}

if (import.meta.main) {
  await deploy();
}
