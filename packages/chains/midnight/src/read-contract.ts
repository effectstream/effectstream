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
  /** Directory where the contract file is located */
  contractDir: string;
};

const cachedContractInfo: Record<string, MidnightContractInfo> = {};

/**
* Recursively searches for all files matching a name in a directory and its subdirectories.
* @param dir - The directory to search in
* @param fileName - The file name to search for
* @param maxDepth - Maximum depth to search (default: 5)
* @param currentDepth - Current search depth (internal use)
* @returns Array of directories containing matching files
*/
function findAllFilesRecursive(
  dir: string,
  fileName: string,
  maxDepth: number = 5,
  currentDepth: number = 0
): string[] {
  const results: string[] = [];
  
  if (currentDepth > maxDepth) {
    return results;
  }
  
  try {
    const entries = Array.from(Deno.readDirSync(dir));
    
    // First check if the file exists in the current directory
    const hasFile = entries.some(entry => 
      entry.isFile && entry.name === fileName
    );
    
    if (hasFile) {
      results.push(dir);
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
        const subResults = findAllFilesRecursive(subDir, fileName, maxDepth, currentDepth + 1);
        results.push(...subResults);
      }
    }
  } catch {
    // Can't read directory, skip it
  }
  
  return results;
}

/**
* Validates that a directory contains a valid Midnight contract structure.
* Checks if the contractName directory with src/managed/ exists.
*/
function isValidMidnightContractDir(dir: string, contractName: string): boolean {
  const managedDir = path.join(dir, contractName, "src/managed");
  try {
    const stats = Deno.statSync(managedDir);
    return stats.isDirectory;
  } catch {
    return false;
  }
}

/**
* Finds the directory containing a Midnight contract by searching for the contract directory structure.
* This is used during deployment when the contract.json file doesn't exist yet.
* Searches for directories matching {contractName}/src/managed/ pattern.
*/
export function findContractDirectoryForDeploy(
  contractName: string,
  baseDir?: string
): string | null {
  let startDir: string;
  
  if (baseDir) {
    startDir = path.resolve(baseDir);
  } else {
    startDir = Deno.cwd();
  }
  
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;
  
  while (currentDir !== root) {
    try {
      const entries = Array.from(Deno.readDirSync(currentDir));
      
      // Check if contract directory exists here
      for (const entry of entries) {
        if (entry.isDirectory && entry.name === contractName) {
          // Validate it's a Midnight contract by checking for src/managed/
          if (isValidMidnightContractDir(currentDir, contractName)) {
            return currentDir;
          }
        }
      }
      
      // Also search recursively in subdirectories (up to 3 levels deep)
      for (const entry of entries) {
        if (entry.isDirectory) {
          const skipDirs = ["node_modules", ".git", "dist", "build", ".deno"];
          if (skipDirs.includes(entry.name)) {
            continue;
          }
          
          try {
            const subDir = path.join(currentDir, entry.name);
            const subEntries = Array.from(Deno.readDirSync(subDir));
            
            // Check direct subdirectory
            for (const subEntry of subEntries) {
              if (subEntry.isDirectory && subEntry.name === contractName) {
                if (isValidMidnightContractDir(subDir, contractName)) {
                  return subDir;
                }
              }
            }
            
            // Check one more level deep
            for (const subEntry of subEntries) {
              if (subEntry.isDirectory && !skipDirs.includes(subEntry.name)) {
                const subSubDir = path.join(subDir, subEntry.name);
                try {
                  const subSubEntries = Array.from(Deno.readDirSync(subSubDir));
                  for (const subSubEntry of subSubEntries) {
                    if (subSubEntry.isDirectory && subSubEntry.name === contractName) {
                      if (isValidMidnightContractDir(subSubDir, contractName)) {
                        return subSubDir;
                      }
                    }
                  }
                } catch {
                  // Skip if can't read
                }
              }
            }
          } catch {
            // Skip if can't read
          }
        }
      }
      
      currentDir = path.dirname(currentDir);
    } catch {
      currentDir = path.dirname(currentDir);
    }
  }
  
  return null;
}

/**
* Finds the directory containing contract files by searching from a starting directory upward.
* At each level, recursively searches downward for the contract file.
* Validates that found contract.json files belong to Midnight contracts.
* This prevents confusion with EVM contract.json files or other similarly named files.
*/
function findContractDirectory(
  startDir: string,
  contractFileName: string,
  contractName: string
): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;
  
  while (currentDir !== root) {
    // Recursively search from current directory downward for ALL matching files
    const foundDirs = findAllFilesRecursive(currentDir, contractFileName);
    
    // Validate each found directory to ensure it's a Midnight contract
    for (const found of foundDirs) {
      if (isValidMidnightContractDir(found, contractName)) {
        return found;
      }
      // If not valid, continue checking other found directories
      // This handles cases where multiple contract.json files exist
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
    // Pass contractName to validate we found the right contract.json (not an EVM one)
    const foundDir = findContractDirectory(Deno.cwd(), contractFileName, contractName);
    
    if (!foundDir) {
      throw new Error(
        `Could not find Midnight contract directory for "${contractName}". ` +
        `Searched for ${contractFileName} starting from ${Deno.cwd()}. ` +
        `Please ensure you're running from a directory that contains or is a parent of the Midnight contract files, ` +
        `or provide an explicit baseDir parameter. ` +
        `Note: This function only finds Midnight contracts (with src/managed/ structure), not EVM contracts.`
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
      contractDir: moduleDir,
    };
    
    return cachedContractInfo[cacheKey];
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error(`Contract files not found - expected: ${contractFileName} and ${contractName}/src/managed/${compilerSubdir}/compiler/contract-info.json`);
    }
    throw new Error(`Failed to read contract files: ${String(err)}`);
  }
}

