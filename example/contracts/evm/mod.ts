// this is a auto generated file.

export * from "./build/mod.ts";
export { contracts } from "./build/contracts.ts";
export * from "./deploy.ts";

// This a placeholder for evm contract addresses.
// TODO This script should read the current /ignition/deployments/chain-* to generate the addresses list.
const __dirname = import.meta.dirname ?? "";
export const contractAddressesEvmMain: () => Record<
  string,
  Record<string, `0x${string}`>
> = () => ({
  chain31337: JSON.parse(
    Deno.readTextFileSync(
      __dirname + "/ignition/deployments/chain-31337/deployed_addresses.json",
    ),
  ),
  chain31338: JSON.parse(
    Deno.readTextFileSync(
      __dirname + "/ignition/deployments/chain-31338/deployed_addresses.json",
    ),
  ),
});
