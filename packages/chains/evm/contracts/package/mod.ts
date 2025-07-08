// This file will be created when running `deno task deploy`
// import addressesEvmMain from "./ignition/deployments/chain-31337/deployed_addresses.json" with {
//   type: "text",
// };
// // This file will be created when running `deno task deploy`
// import addressesEvmParallel from "./ignition/deployments/chain-31338/deployed_addresses.json" with {
//   type: "text",
// };
const __dirname: any = import.meta.dirname;
const addressesEvmMain = Deno.readTextFileSync(
  `${__dirname}/ignition/deployments/chain-31337/deployed_addresses.json`,
);
const addressesEvmParallel = Deno.readTextFileSync(
  `${__dirname}/ignition/deployments/chain-31338/deployed_addresses.json`,
);

/**
 * Example format
 * {
 *   "Erc20Dev#Erc20Dev": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
 *   "PaimaL2Contract#PaimaL2Contract": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
 * }
 */
const contractAddressesEvmMain = JSON.parse(addressesEvmMain) as Record<
  string,
  `0x${string}`
>;
const contractAddressesEvmParallel = JSON.parse(addressesEvmParallel) as Record<
  string,
  `0x${string}`
>;

export { contractAddressesEvmMain, contractAddressesEvmParallel };
export { deploy } from "./deploy.ts";
