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
* Recursively searches for a file in a directory and its subdirectories.
* @param dir - The directory to search in
* @param fileName - The file name to search for
* @param maxDepth - Maximum depth to search (default: 5)
* @param currentDepth - Current search depth (internal use)
* @returns The directory containing the file, or null if not found
*/
function findFileRecursive(
  dir: string,
  fileName: string,
  maxDepth: number = 5,
  currentDepth: number = 0
): string | null {
  if (currentDepth > maxDepth) {
    return null;
  }
  
  try {
    const entries = Array.from(Deno.readDirSync(dir));
    
    // First check if the file exists in the current directory
    const hasFile = entries.some(entry => 
      entry.isFile && entry.name === fileName
    );
    
    if (hasFile) {
      return dir;
    }
    
    // Then recursively search subdirectories
    for (const entry of entries) {
      if (entry.isDirectory) {
        // Skip common directories that are unlikely to contain contracts
        const skipDirs = ["node_modules", ".git", "dist", "build", ".deno"];
        if (skipDirs.includes(entry.name)) {
          continue;
        }
        
        const subDir = path.join(dir, entry.name);
        const found = findFileRecursive(subDir, fileName, maxDepth, currentDepth + 1);
        if (found) {
          return found;
        }
      }
    }
  } catch {
    // Can't read directory, skip it
    return null;
  }
  
  return null;
}

/**
* Finds the directory containing contract files by searching from a starting directory upward.
* At each level, recursively searches downward for the contract file.
*/
function findContractDirectory(startDir: string, contractFileName: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;
  
  while (currentDir !== root) {
    // Recursively search from current directory downward
    const found = findFileRecursive(currentDir, contractFileName);
    if (found) {
      return found;
    }
    
    // Move up one directory
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

/**
* Reads contract information from JSON files in a context-aware manner.
* 
* The function detects the directory containing contract files by searching
* from the current working directory upward, or uses an explicit baseDir if provided.
* This makes it work regardless of where the function is imported from.
* 
* @param contractName - The name of the contract directory (e.g., 'contract-eip-1155', 'contract-counter')
* @param contractFileName - The name of the contract address file (default: 'contract.json')
* @param baseDir - Optional base directory override. If not provided, searches from Deno.cwd() upward
* @returns The complete contract information including address and compiler data
*/
export function readMidnightContract(
  contractName: string,
  contractFileName: string = "contract.json",
  baseDir?: string
): MidnightContractInfo {
  let compilerSubdir = "";
  let moduleDir: string;
  
  // Determine the base directory for contract resolution first
  if (baseDir) {
    // Explicit base directory provided
    moduleDir = path.resolve(baseDir);
  } else {
    // Search for the directory containing the contract file
    // Start from current working directory and walk up
    const foundDir = findContractDirectory(Deno.cwd(), contractFileName);
    
    if (!foundDir) {
      throw new Error(
        `Could not find contract directory. Searched for ${contractFileName} starting from ${Deno.cwd()}. ` +
        `Please ensure you're running from a directory that contains or is a parent of the contract files, ` +
        `or provide an explicit baseDir parameter.`
      );
    }
    
    moduleDir = foundDir;
  }
  
  // Use cache key that includes the resolved directory path to ensure cache works correctly
  // across different working directories and explicit baseDir parameters
  const cacheKey = `${path.resolve(moduleDir)}:${contractName}:${contractFileName}`;
  if (cachedContractInfo[cacheKey]) return cachedContractInfo[cacheKey];
  
  try {
    
    // Construct the full paths relative to the determined base directory
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
    
    cachedContractInfo[cacheKey] = {
      ...contractAddressInfo,
      contractInfo,
      zkConfigPath,
    };
    
    return cachedContractInfo[cacheKey];
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error(`Contract files not found - expected: ${contractFileName} and ${contractName}/src/managed/${compilerSubdir}/compiler/contract-info.json`);
    }
    throw new Error(`Failed to read contract files: ${String(err)}`);
  }
}

