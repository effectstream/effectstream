import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type { buildModule } from "@nomicfoundation/ignition-core";
import type { HardhatUserConfig } from "hardhat/config";

export type DeploymentSpec = {
  module: ReturnType<typeof buildModule>;
  network: string;
  parameters?: Record<string, Record<string, any>>;
};

export async function deployModules(
  config: HardhatUserConfig,
  projectRoot: string,
  deployments: DeploymentSpec[],
): Promise<void> {
  const hre = await createHardhatRuntimeEnvironment(config, projectRoot);
  const messages: string[] = [];

  for (const d of deployments) {
    const network = await hre.network.connect(d.network);
    const result = await (network as any).ignition.deploy(
      d.module,
      d.parameters ? { parameters: d.parameters } : undefined,
    );
    const keys = Object.keys(result);
    const firstContract = result[keys[0]];
    messages.push(
      `${d.module.id.substring(0, 30).padEnd(30)} @ ${d.network.padEnd(16)} -> ${firstContract?.address ?? "??"}`,
    );
  }

  console.log("Deployed contracts:\n", messages.join("\n"));
  await new Promise((r) => setTimeout(r, 2000));
}
