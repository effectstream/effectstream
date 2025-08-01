export type MidnightContractInfo = {
  contractAddress: string;
};

let cachedContractInfo: MidnightContractInfo | undefined;
export function readMidnightContract(): MidnightContractInfo {
  if (cachedContractInfo) return cachedContractInfo;
  try {
    // Get the directory of the current module file using Deno's URL API
    const dir = new URL(".", import.meta.url);
    // Construct the full path to contract.json
    const contractPath = new URL("contract.json", dir);
    const contractJson = Deno.readTextFileSync(contractPath);
    const contractInfo = JSON.parse(contractJson) as MidnightContractInfo;
    cachedContractInfo = contractInfo;
    return contractInfo;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error("contract.json not found in the current directory");
    }
    throw new Error(`Failed to read contract.json: ${String(err)}`);
  }
}
