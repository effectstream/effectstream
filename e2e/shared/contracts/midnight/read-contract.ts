/**
* Information about a compiled Midnight contract
*/
export type MidnightContractCompilerInfo = {
  /** Circuit definitions for the contract */
  circuits: any[];
  /** Witness definitions for the contract */
  witnesses: any[];
  /** Contract definitions */
  contracts: any[];
};

/**
* Address information for a deployed contract
*/
export type MidnightContractAddressInfo = {
  /** The deployed contract address */
  contractAddress: string;
};

/**
* Complete contract information combining address and compiler info
*/
export type MidnightContractInfo = MidnightContractAddressInfo & {
  /** Compiler-generated contract information */
  contractInfo: MidnightContractCompilerInfo;
};

let cachedContractInfo: Record<string, MidnightContractInfo> = {};

/**
* Reads contract information from JSON files
* 
* @param contractName - The name of the contract directory (e.g., 'contract-eip-1155', 'contract-counter')
* @param contractFileName - The name of the contract address file (default: 'contract.json')
* @returns The complete contract information including address and compiler data
*/
export function readMidnightContract(
  contractName: string,
  contractFileName: string = "contract.json"
): MidnightContractInfo {
  if (cachedContractInfo[contractName]) return cachedContractInfo[contractName];
  try {
    // Get the directory of the current module file using Deno's URL API
    const dir = new URL(".", import.meta.url);
    // Construct the full path to the contract address file
    const contractPath = new URL(contractFileName, dir);
    
    // Find the first directory inside the managed directory
    const managedDir = new URL(`./${contractName}/src/managed/`, dir);
    let compilerSubdir = "";
    try {
      for (const entry of Deno.readDirSync(managedDir)) {
        if (entry.isDirectory) {
          compilerSubdir = entry.name;
          break;
        }
      }
    } catch (error) {
      throw new Error(`Managed directory not found: ${managedDir.pathname}`);
    }
    
    if (!compilerSubdir) {
      throw new Error(`No subdirectory found in managed directory: ${managedDir.pathname}`);
    }

    // Construct the full path to the contract info file using the first found subdirectory
    const contractInfoPath = new URL(`./${contractName}/src/managed/${compilerSubdir}/compiler/contract-info.json`, dir);

    const contractAddressJson = Deno.readTextFileSync(contractPath);
    const contractInfoJson = Deno.readTextFileSync(contractInfoPath);
    const contractAddressInfo = JSON.parse(contractAddressJson) as MidnightContractAddressInfo;
    const contractInfo = JSON.parse(contractInfoJson) as MidnightContractCompilerInfo;
    
    cachedContractInfo[contractName] = {
      ...contractAddressInfo,
      contractInfo,
    };
    
    return cachedContractInfo[contractName];
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error(`Contract files not found - expected: ${contractFileName} and ${contractName}/src/managed/multichain_multitoken/compiler/contract-info.json`);
    }
    throw new Error(`Failed to read contract files: ${String(err)}`);
  }
}