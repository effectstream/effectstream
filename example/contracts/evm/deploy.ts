// import hre from "hardhat";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import * as config from "./hardhat.config.ts";
import Erc20DevModule from "./ignition/modules/erc20dev.ts";
import PaimaL2ContractModule from "./ignition/modules/paimaL2.ts";
import Erc721DevModule from "./ignition/modules/erc721dev.ts";

const __dirname: any = import.meta.dirname;

type DeployedContract = {
  chain: string;
  name: string;
  address: `0x${string}`;
  abi: {
    // TODO Improve this type.
    name: string;
    inputs?: any[];
    outputs?: any[];
    type: string;
    stateMutability?: string;
  }[];
};

/* Manual script
  rm -rf ./ignition/deployments
  deno -A hardhat ignition deploy ./ignition/modules/erc20dev.ts --network evmMain && \
  deno -A hardhat ignition deploy ./ignition/modules/paimal2.ts --network evmMain --parameters ./parameters.json && \
  deno -A hardhat ignition deploy ./ignition/modules/erc721dev.ts --network evmMain && \
  deno -A hardhat ignition deploy ./ignition/modules/erc20dev.ts --network evmParallel && \
  deno -A hardhat ignition deploy ./ignition/modules/erc721dev.ts --network evmParallel
*/

/*
 * Deploy the contracts to the network.
 *
 * Returns a record of the deployed contracts with their addresses and ABIs.
 */
export async function deploy(): Promise<DeployedContract[]> {
  // We need to create the hardhat runtime
  // As this file is read from the runner/caller relative path
  const hre = await createHardhatRuntimeEnvironment(config.default, __dirname);

  // This is the network where the contracts will be deployed.
  // This value must match the network name in the hardhat.config.ts file:
  // networks[name]
  // const x = await hre.tasks.getTask("node").run();
  // console.log(x);
  const network = await hre.network.connect("evmMain");
  console.log("--------------------------------");
  console.log(hre);
  console.log("--------------------------------");
  console.log(network);
  console.log("--------------------------------");
  // Example how to deploy a basic ERC20 contract.
  // Deploy the Erc20DevModule contract.
  const erc20Deployment = await (network as any).ignition.deploy(
    Erc20DevModule,
  );

  // Example how to deploy a PaimaL2 contract.
  // This is the native contract that Paima Engine uses to interact with users.
  const paimaL2Deployment = await (network as any).ignition.deploy(
    PaimaL2ContractModule,
    {
      parameters: {
        PaimaL2ContractModule: {
          // IMPORTANT:
          // This Address is a hardhat test account.
          // It's private key is publicallty known.
          // For production use your own key pair.
          owner: "0xEFfE522D441d971dDC7153439a7d10235Ae6301f",
          fee: 0,
        },
      },
    },
  );

  // Example how to deploy a basic ERC20 contract.
  // Deploy the Erc20DevModule contract.
  const erc721Deployment = await (network as any).ignition.deploy(
    Erc721DevModule,
  );

  // Deploy to the secunday EVM Network.
  const network2 = await hre.network.connect("evmParallel");

  // Deploy the Erc20DevModule contract.
  const erc20Deployment2 = await (network2 as any).ignition.deploy(
    Erc20DevModule,
  );

  // Deploy the Erc721DevModule contract.
  const erc721Deployment2 = await (network2 as any).ignition.deploy(
    Erc721DevModule,
  );

  const results: DeployedContract[] = [
    {
      chain: "evmMain",
      name: "Erc20DevModule#Erc20Dev",
      address: (erc20Deployment.contract as any).address,
      abi: (erc20Deployment.contract as any).abi,
    },
    {
      chain: "evmMain",
      name: "PaimaL2ContractModule#PaimaL2Contract",
      address: (paimaL2Deployment.contract as any).address,
      abi: (paimaL2Deployment.contract as any).abi,
    },
    {
      chain: "evmMain",
      name: "Erc721DevModule#Erc721Dev",
      address: (erc721Deployment.contract as any).address,
      abi: (erc721Deployment.contract as any).abi,
    },
    {
      chain: "evmParallel",
      name: "Erc20DevModule#Erc20Dev",
      address: (erc20Deployment2.contract as any).address,
      abi: (erc20Deployment2.contract as any).abi,
    },
    {
      chain: "evmParallel",
      name: "Erc721DevModule#Erc721Dev",
      address: (erc721Deployment2.contract as any).address,
      abi: (erc721Deployment2.contract as any).abi,
    },
  ] as const;

  console.error("--------------------------------");
  // console.trace();
  console.error("Deployed contracts:");
  results.forEach((result) => {
    console.error(`${result.name} @ ${result.address}`);
  });

  return results;
}

if (import.meta.main) {
  await deploy();
}
