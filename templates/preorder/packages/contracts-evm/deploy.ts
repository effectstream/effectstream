import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import * as config from "./hardhat.config.ts";
import { MockERC20Module, LaunchpadFactoryModule } from "./ignition/modules/deploy.ts";
import type { buildModule } from "@nomicfoundation/ignition-core";
import { createPublicClient, createWalletClient, http, decodeEventLog } from "viem";
import { hardhat } from "viem/chains";
import fs from "node:fs";
import path from "node:path";

const __dirname: any = import.meta.dirname;

const REFERRER_REWARD_BPS = 500n; // 5%

type Deployment = {
  module: ReturnType<typeof buildModule>;
  network: string;
  parameters?: Record<string, Record<string, any>>;
};

const myDeployments: Deployment[] = [
  { module: MockERC20Module, network: "evmMainHttp" },
  { module: LaunchpadFactoryModule, network: "evmMainHttp" },
] as const;

export async function deploy(): Promise<void> {
  const hre = await createHardhatRuntimeEnvironment(config.default, __dirname);

  const results: Record<string, any> = {};
  for (const deployment of myDeployments) {
    const network = await hre.network.connect(deployment.network);
    const result = await (network as any).ignition.deploy(
      deployment.module,
      deployment.parameters ? { parameters: deployment.parameters } : undefined,
    );
    results[deployment.module.id] = result;
    console.log(`Deployed module: ${deployment.module.id}`);
  }

  const factoryResult = results["LaunchpadFactoryModule"];
  const mockErc20Result = results["MockERC20Module"];

  const factoryAddress = factoryResult.factory.address as `0x${string}`;
  const mockErc20Address = mockErc20Result.mockErc20.address as `0x${string}`;
  console.log(`Factory: ${factoryAddress}`);
  console.log(`MockERC20: ${mockErc20Address}`);

  const publicClient = createPublicClient({ chain: hardhat, transport: http("http://localhost:8545") });
  const walletClient = createWalletClient({
    chain: hardhat,
    transport: http("http://localhost:8545"),
    account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
  });

  const hash = await walletClient.writeContract({
    address: factoryAddress,
    abi: [{
      type: "function",
      name: "deploy",
      inputs: [
        { name: "owner", type: "address" },
        { name: "referrerRewardBps", type: "uint256" },
        { name: "acceptedPaymentTokens", type: "address[]" },
      ],
      outputs: [{ name: "", type: "address" }],
      stateMutability: "nonpayable",
    }],
    functionName: "deploy",
    args: [
      walletClient.account.address,
      REFERRER_REWARD_BPS,
      [mockErc20Address],
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  const factoryAbi = [{
    type: "event" as const,
    name: "LaunchpadDeployed",
    inputs: [{ name: "launchpad", type: "address", indexed: false }],
  }];

  let proxyAddress: string | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "LaunchpadDeployed") {
        proxyAddress = (decoded.args as any).launchpad;
        break;
      }
    } catch { /* not this event */ }
  }

  if (!proxyAddress) {
    throw new Error("Could not find LaunchpadDeployed event in tx receipt");
  }

  console.log(`Launchpad Proxy: ${proxyAddress}`);

  const extraAddressesPath = path.join(__dirname, "build", "extra-addresses.json");
  await fs.promises.mkdir(path.join(__dirname, "build"), { recursive: true });
  await fs.promises.writeFile(
    extraAddressesPath,
    JSON.stringify({
      launchpadProxy: proxyAddress,
      factory: factoryAddress,
      mockErc20: mockErc20Address,
    }, null, 2),
  );

  console.log(`Saved extra addresses to ${extraAddressesPath}`);
  await new Promise((r) => setTimeout(r, 1000 * 2));
}

if (import.meta.main) {
  await deploy();
}
