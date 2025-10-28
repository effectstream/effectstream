import * as path from "@std/path";

type MidnightContractCompilerInfo = {
  circuits: any[];
  witnesses: any[];
  contracts: any[];
};
type MidnightContractAddressInfo = {
  contractAddress: string;
};
export type MidnightContractInfo = MidnightContractAddressInfo & {
  contractInfo: MidnightContractCompilerInfo;
  zkConfigPath: string;
};

let cachedContractInfo: MidnightContractInfo | undefined;
export function readMidnightContract(): MidnightContractInfo {
  if (cachedContractInfo) return cachedContractInfo;
  try {
    // Get the directory of the current module file using Deno's URL API
    const moduleDir = path.dirname(new URL(import.meta.url).pathname);
    // Construct the full paths relative to this module's location
    const contractPath = path.join(moduleDir, "contract.json");
    const contractInfoPath = path.join(
      moduleDir,
      "./contract-eip-1155/src/managed/multichain_multitoken/compiler/contract-info.json",
    );
    const zkConfigPath = path.resolve(
      path.join(
        moduleDir,
        "./contract-eip-1155/src/managed/multichain_multitoken",
      ),
    );
    const contractAddressJson = Deno.readTextFileSync(contractPath);
    const contractInfoJson = Deno.readTextFileSync(contractInfoPath);
    const contractAddressInfo = JSON.parse(contractAddressJson) as MidnightContractAddressInfo;
    const contractInfo = JSON.parse(contractInfoJson) as MidnightContractCompilerInfo;
    return {
      ...contractAddressInfo,
      contractInfo,
      zkConfigPath,
    };
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error("contract.json not found in the current directory");
    }
    throw new Error(`Failed to read contract.json: ${String(err)}`);
  }
}
