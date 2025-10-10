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
    // TODO: this file is been imported by the node and the browser.
    //      So we need to update this is read or imported.
    if (Deno) {
      console.error(err);
      throw new Error("contract.json not found in the current directory");
    }
    return {
      contractAddress: "",
    }
  }
}
