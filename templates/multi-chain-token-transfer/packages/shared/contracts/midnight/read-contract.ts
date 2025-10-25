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
};

let cachedContractInfo: MidnightContractInfo | undefined;
export function readMidnightContract(): MidnightContractInfo {
  if (cachedContractInfo) return cachedContractInfo;
  try {
    // Get the directory of the current module file using Deno's URL API
    const dir = new URL(".", import.meta.url);
    // Construct the full path to contract.json
    const contractPath = new URL("contract.json", dir);
    const contractInfoPath = new URL("./contract-eip-1155/src/managed/multichain_multitoken/compiler/contract-info.json", dir);
    const contractAddressJson = Deno.readTextFileSync(contractPath);
    const contractInfoJson = Deno.readTextFileSync(contractInfoPath);
    const contractAddressInfo = JSON.parse(contractAddressJson) as MidnightContractAddressInfo;
    const contractInfo = JSON.parse(contractInfoJson) as MidnightContractCompilerInfo;
    return {
      ...contractAddressInfo,
      contractInfo,
    };
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error("contract.json not found in the current directory");
    }
    throw new Error(`Failed to read contract.json: ${String(err)}`);
  }
}
