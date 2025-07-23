// import hre from "hardhat";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import * as config from "./hardhat.config.ts";
import Erc20DevModule from "./ignition/modules/erc20dev.ts";
import PaimaL2ContractModule from "./ignition/modules/paimaL2.ts";
import Erc721DevModule from "./ignition/modules/erc721dev.ts";
import type { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
// import CounterModule from "./ignition/modules/counter.ts";
// import OpenZeppelinErc20DevModule from "./ignition/modules/oz-erc20dev.ts";

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
    module: Erc20DevModule,
    network: "evmMainHttp",
  },
  {
    module: PaimaL2ContractModule,
    network: "evmMainHttp",
    parameters: {
      PaimaL2ContractModule: {
        owner: "0xEFfE522D441d971dDC7153439a7d10235Ae6301f",
        fee: 0,
      },
    },
  },
  {
    module: Erc721DevModule,
    network: "evmMainHttp",
  },
  {
    module: Erc20DevModule,
    network: "evmParallelHttp",
  },
  {
    module: Erc721DevModule,
    network: "evmParallelHttp",
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
