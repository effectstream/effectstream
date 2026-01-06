import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import * as config from "./hardhat.config.ts";
import DeployModule from "./ignition/modules/deploy.ts";
import type { buildModule } from "@nomicfoundation/ignition-core";

const __dirname: any = import.meta.dirname;

type Deployment = {
  module: ReturnType<typeof buildModule>;
  network: string;
  parameters?: Record<string, Record<string, any>>;
};

// This is an example of how to deploy contracts.
// This is the list of contracts to deploy.
// Add or remove contracts as needed.
const myDeployments: Deployment[] = [
  {
    module: DeployModule,
    network: "evmMainHttp",
    parameters: {
      L2Contract: {
        owner: "0xEFfE522D441d971dDC7153439a7d10235Ae6301f",
        fee: 0,
      },
      AccountNft: {
        name: "Dice Account",
        ticker: "DICE",
        price: 1000000000000000, // 0.001 ETH
      },
    },
  },
] as const;

/**
 * Wait for network to be ready by attempting to connect
 */
async function waitForNetwork(maxAttempts = 20, delayMs = 500): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch("http://localhost:8545", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });
      if (response.ok) {
        console.log(`Network ready after ${i + 1} attempts`);
        return;
      }
    } catch (e) {
      // Network not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Network failed to become ready");
}

/**
 * Deploy the contracts to the network.
 */
export async function deploy(): Promise<void> {
  // Wait for Hardhat network to be ready
  console.log("Waiting for Hardhat network to be ready...");
  await waitForNetwork();

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
      } deployed`,
    );
  }
  console.log("Deployed contracts:\n", messages.join("\n"));
  // Wait for a block to be minted on the slowest chain.
  await new Promise((r) => setTimeout(r, 1000 * 2));
}

if (import.meta.main) {
  await deploy();
}
