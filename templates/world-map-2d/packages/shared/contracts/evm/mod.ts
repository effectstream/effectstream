// this is a auto-generated file.

import { existsSync, readFileSync } from "node:fs";

export * from "./build/mod.ts";
export { contracts } from "./build/contracts.ts";
const __dirname = import.meta.dirname ?? "";
export const contractAddressesEvmMain: () => Record<
  "chain31337",
  Record<string, `0x${string}`>> = () => {

  const file1 = __dirname + "/ignition/deployments/chain-31337/deployed_addresses.json";

  let chain31337: Record<string, `0x${string}`> = {};

  if (existsSync(file1)) {
    chain31337 = JSON.parse(readFileSync(file1, "utf-8"));
  }

  return {
    chain31337
  };
}
