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
* Supports both legacy format (string) and new format (network-keyed object)
*/
export type MidnightContractAddressInfo = {
  /** The deployed contract address - can be a string (legacy) or network-keyed object */
  contractAddress: string
};

/**
* Complete contract information combining address and compiler info
*/
export type MidnightContractInfo = {
  /** The deployed contract address for the specified network */
  contractAddress: string;
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
 * Determine whether a directory contains the expected Midnight compiler artifacts.
 */
function hasManagedArtifacts(dir: string): boolean {
  const requiredDirs = ["compiler", "contract"];
  try {
    return requiredDirs.every((entry) => {
      const stats = Deno.statSync(path.join(dir, entry));
      return stats.isDirectory;
    });
  } catch {
    return false;
  }
}

/**
 * Resolves the directory that actually holds the managed compiler artifacts.
 * Supports both nested structures (src/managed/<name>/...) and flattened ones
 * (src/managed/...).
 */
function resolveManagedArtifactsDir(managedDir: string): string {
  try {
    for (const entry of Deno.readDirSync(managedDir)) {
      if (!entry.isDirectory) continue;
      const candidate = path.join(managedDir, entry.name);
      if (hasManagedArtifacts(candidate)) {
        return candidate;
      }
    }
  } catch {
    // handled below
  }

  if (hasManagedArtifacts(managedDir)) {
    return managedDir;
  }

  throw new Error(
    `Managed compiler artifacts not found under ${managedDir}. ` +
      `Expected either src/managed/<subdir>/{contract,compiler,...} or ` +
      `src/managed/{contract,compiler,...}.`
  );
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
* @param options - Optional configuration: baseDir to override search location, networkId to select specific network
* @returns The complete contract information including address and compiler data
*/
export function readMidnightContract(
  contractName: string,
  options?: { baseDir?: string; networkId?: string; contractFileName?: string }
): MidnightContractInfo {
  const baseDir = options?.baseDir;
  const resolvedNetworkId = options?.networkId || "undeployed";
  const networkFileName = `${contractName}.${resolvedNetworkId}.json`;
  const candidateFileNames = [
    networkFileName,
    `${contractName}.json`,
    "contract.json",
  ];


  let moduleDir: string;

  if (baseDir) {
    moduleDir = path.resolve(baseDir);
  } else if (typeof Deno !== "undefined") {
    let foundDir: string | null = null;

    for (const candidate of candidateFileNames) {
      const dir = findContractDirectory(Deno.cwd(), candidate, contractName);
      if (dir) {
        foundDir = dir;
        break;
      }
    }

    if (!foundDir) {
      throw new Error(
        `Could not find Midnight contract directory for "${contractName}". ` +
          `Searched for ${candidateFileNames.join(", ")} starting from ${path.resolve(Deno.cwd())}. ` +
          `Please ensure you're running from a directory that contains or is a parent of the Midnight contract files, ` +
          `or provide an explicit baseDir parameter. ` +
          `Note: This function only finds Midnight contracts (with src/managed/ structure), not EVM contracts.`
      );
    }

    moduleDir = foundDir;
  } else {
    const envContractAddress =
      typeof Deno !== "undefined"
        ? Deno.env.get("MIDNIGHT_CONTRACT_ADDRESS")
        : undefined;
    return {
      contractAddress: envContractAddress || "",
      contractInfo: { circuits: [], witnesses: [], contracts: [] },
      zkConfigPath: "",
      contractDir: "",
    };
  }

  const normalizedModuleDir = path.resolve(moduleDir);
  for (const candidate of candidateFileNames) {
    const cacheKey = `${normalizedModuleDir}:${contractName}:${candidate}`;
    if (cachedContractInfo[cacheKey]) return cachedContractInfo[cacheKey];
  }

  let contractAddressJson: string | undefined;
  let actualContractFileName: string | undefined;

  for (const candidate of candidateFileNames) {
    const candidatePath = path.join(moduleDir, candidate);
    try {
      contractAddressJson = Deno.readTextFileSync(candidatePath);
      actualContractFileName = candidate;
      break;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        continue;
      }
      throw err;
    }
  }

  if (!contractAddressJson || !actualContractFileName) {
    throw new Error(
      `Contract files not found for "${contractName}". Tried: ${candidateFileNames.join(
        ", ",
      )} under ${moduleDir}. Please verify the compiler artifacts and contract JSON exist.`
    );
  }

  let managedArtifactsDir = "";
  try {
    // Find the first directory inside the managed directory
    const managedDir = path.join(moduleDir, contractName, "src/managed/");
    try {
      managedArtifactsDir = resolveManagedArtifactsDir(managedDir);
    } catch (error) {
      throw new Error(
        `Managed directory not found or invalid: ${managedDir}. ${(error as Error).message}`
      );
    }

    // Construct the full path to the contract info file using the resolved managed directory
    const contractInfoPath = path.join(
      managedArtifactsDir,
      "compiler/contract-info.json"
    );
    const zkConfigPath = path.resolve(managedArtifactsDir);
    const contractInfoJson = Deno.readTextFileSync(contractInfoPath);
    const contractAddressInfo = JSON.parse(contractAddressJson) as MidnightContractAddressInfo;
    const contractInfo = JSON.parse(contractInfoJson) as MidnightContractCompilerInfo;
    
    // Handle both legacy format (string) and new format (network-keyed object)
    let contractAddress: string;
    let contractAddresses: Record<string, string>;
    
    if (typeof contractAddressInfo.contractAddress === "string") {
      // Legacy format - single string address
      contractAddress = contractAddressInfo.contractAddress;
      contractAddresses = { [resolvedNetworkId]: contractAddress };
    } else {
      contractAddresses = contractAddressInfo.contractAddress;
      contractAddress = contractAddresses[resolvedNetworkId];
      
      if (!contractAddress) {
        throw new Error(
          `Contract address not found for network "${resolvedNetworkId}". ` +
          `Available networks: ${Object.keys(contractAddresses).join(", ")}`
        );
      }
    }
    
    // Override contract address if MIDNIGHT_CONTRACT_ADDRESS env var is set
    const envContractAddress = Deno.env.get("MIDNIGHT_CONTRACT_ADDRESS");
    if (envContractAddress) {
      contractAddress = envContractAddress;
      contractAddresses[resolvedNetworkId] = envContractAddress;
    }
    
    const cacheKey = `${normalizedModuleDir}:${contractName}:${actualContractFileName}`;
    cachedContractInfo[cacheKey] = {
      contractAddress,
      contractInfo,
      zkConfigPath,
      contractDir: moduleDir,
    };

    return cachedContractInfo[cacheKey];
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      const fileList = candidateFileNames
        .map((name) => path.join(moduleDir, name))
        .join(", ");
      throw new Error(
        `Contract files not found - expected one of [${fileList}] and compiler artifacts under ${managedArtifactsDir}.`
      );
    }
    throw new Error(`Failed to read contract files: ${String(err)}`);
  }
}

