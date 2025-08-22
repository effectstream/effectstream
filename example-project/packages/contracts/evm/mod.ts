// this is a auto generated file.

export * from "./build/mod.ts";
export { contracts } from "./build/contracts.ts";
// export * from "./deploy.ts";

// This a placeholder for evm contract addresses.
// TODO This script should read the current /ignition/deployments/chain-* to generate the addresses list.
const __dirname = import.meta.dirname ?? "";
export const contractAddressesEvmMain: () => Record<
  "chain31337" | "chain31338",
  Record<string, `0x${string}`>
> = () => {
  // TODO Create this dynamically with the mod.ts deployment script.
  const file1 = __dirname +
    "/ignition/deployments/chain-31337/deployed_addresses.json";
  const file2 = __dirname +
    "/ignition/deployments/chain-31338/deployed_addresses.json";

  let chain31337: Record<string, `0x${string}`> = {};
  if (Deno.statSync(file1).isFile) {
    chain31337 = JSON.parse(Deno.readTextFileSync(file1));
  }
  let chain31338: Record<string, `0x${string}`> = {};
  if (Deno.statSync(file2).isFile) {
    chain31338 = JSON.parse(Deno.readTextFileSync(file2));
  }

  return {
    chain31337,
    chain31338,
  };
};
