import * as path from "@std/path";
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
  zkConfigPath: string;
};

const cachedContractInfo: Record<string, MidnightContractInfo> = {};

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
  let compilerSubdir = "";
  try {
    // Get the directory of the current module file using Deno's URL API
    const moduleDir = path.dirname(new URL(import.meta.url).pathname);
    // Construct the full paths relative to this module's location
    const contractPath = path.join(moduleDir, contractFileName);
    
    // Find the first directory inside the managed directory
    const managedDir = path.join(moduleDir, contractName, "src/managed/");
    try {
      for (const entry of Deno.readDirSync(managedDir)) {
        if (entry.isDirectory) {
          compilerSubdir = entry.name;
          break;
        }
      }
    } catch (error) {
      throw new Error(`Managed directory not found: ${managedDir}`);
    }
    
    if (!compilerSubdir) {
      throw new Error(`No subdirectory found in managed directory: ${managedDir}`);
    }

    // Construct the full path to the contract info file using the first found subdirectory
    const contractInfoPath = path.join(
      moduleDir,
      contractName,
      "src/managed",
      compilerSubdir,
      "compiler/contract-info.json"
    );
    console.log(`contractInfoPath: ${contractInfoPath}`);
    const zkConfigPath = path.resolve(
      path.join(
        moduleDir,
        contractName,
        "src/managed",
        compilerSubdir
      )
    );
    const contractAddressJson = Deno.readTextFileSync(contractPath);
    const contractInfoJson = Deno.readTextFileSync(contractInfoPath);
    const contractAddressInfo = JSON.parse(contractAddressJson) as MidnightContractAddressInfo;
    const contractInfo = JSON.parse(contractInfoJson) as MidnightContractCompilerInfo;
    
    cachedContractInfo[contractName] = {
      ...contractAddressInfo,
      contractInfo,
      zkConfigPath,
    };
    
    return cachedContractInfo[contractName];
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error(`Contract files not found - expected: ${contractFileName} and ${contractName}/src/managed/${compilerSubdir}/compiler/contract-info.json`);
    }
    throw new Error(`Failed to read contract files: ${String(err)}`);
  }
}