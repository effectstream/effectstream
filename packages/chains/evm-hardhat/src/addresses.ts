import { readFileSync } from "fs";
import { join } from "path";

export function readDeployedAddresses(
  contractsDir: string,
  chainId: number,
): Record<string, string> {
  const path = join(
    contractsDir,
    `ignition/deployments/chain-${chainId}/deployed_addresses.json`,
  );
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function readContractArtifact(
  contractsDir: string,
  chainId: number,
  moduleAndContract: string,
): any {
  const path = join(
    contractsDir,
    `ignition/deployments/chain-${chainId}/artifacts/${moduleAndContract}.json`,
  );
  return JSON.parse(readFileSync(path, "utf-8"));
}
