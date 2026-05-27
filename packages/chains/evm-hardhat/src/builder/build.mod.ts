import { promises as fs } from "node:fs";
import path from "node:path";

const debug = false;
/*
 * This script is used to build a mod.ts that exports the contracts ABI in .ts format compatible with viem
 * Also exports the contracts addresses for the chains.
 */

/** Check if a file exists
 * @param filePath - The path to the file.
 * @returns True if the file exists, false otherwise.
 */
const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
};

/** Find files matching a pattern
 *
 * @param dir - The directory to search for files.
 * @param pattern - The pattern to match for files.
 * @returns An array of relative file paths that match the pattern.
 */
async function findFiles(dir: string, pattern: string): Promise<string[]> {
  const files: string[] = [];

  if (!(await exists(dir))) {
    return files;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath, pattern)));
    } else if (entry.isFile() && entry.name.endsWith(pattern)) {
      files.push(fullPath);
    }
  }

  return files;
}


const getBaseContractsContent = () => `
// this is a auto-generated file, do not edit it manually

import path from "node:path";
const __dirname = import.meta.dirname ?? "";
export const contracts = {\n`;

/**
 * Build a map of contract names to their paths.
 * Creates ./build/contracts.ts file.
 * @returns void
 */
async function buildContracts(): Promise<void> {
  const contractsFile = "./build/contracts.ts";
  let contractsContent = getBaseContractsContent();

  // Ensure the output dir exists so writeFile (which does not create parents)
  // succeeds regardless of caller — the builder owns its own ./build directory.
  await fs.mkdir("./build", { recursive: true });

  // Find all .sol files in the contracts directory
  const solFiles = await findFiles("./src/contracts", ".sol");

  for (const solFile of solFiles) {
    const filename = path.basename(solFile, ".sol");
    const relativePath = solFile.replace(/^build\//, "");
    // Generate:
    // "fileName": path.relative(__dirname, "relativePath/fileName.sol");
    contractsContent += `  "${filename}": path.join(__dirname, "${relativePath}"),\n`;
  }
  // Terminate contracts variable.
  contractsContent += "} as const;\n";

  await fs.writeFile(contractsFile, contractsContent);
  if (debug) {
    console.log(`Created "${contractsFile}" with ${solFiles.length} contract entries`);
  }
}

/**
 * Build TypeScript artifacts for the contracts ABI.
 * Creates ./build/artifacts/forge/*.sol/*.ts files.
 * @returns void
 */
async function buildTypeScriptArtifacts(): Promise<void> {
  // Process Forge artifacts: convert JSON files to TypeScript exports
  const forgeArtifactsDir = "./build/artifacts/forge";

  if (!(await exists(forgeArtifactsDir))) {
    // Fail loudly rather than silently emitting an empty mod.ts. The TypeScript
    // bindings are generated from the Forge artifacts, so a missing forge build
    // means the contract ABIs (e.g. `erc721dev`) would be absent and downstream
    // imports would break far from the cause. Run `build:forge` before this.
    throw new Error(
      `No forge artifacts found at "${forgeArtifactsDir}". Run \`build:forge\` (forge build) before generating the mod — the TypeScript bindings are derived from the Forge output.`,
    );
  }

  const modFile = "./build/mod.ts";
  let modContent =
    "// this is a auto-generated file, do not edit it manually\n\n";

  // Track export names to avoid duplicates
  const exportNames = new Set<string>();

  // Find all JSON files and process them (skip build-info folder)
  const jsonFiles = (
    await findFiles("./build/artifacts/forge", ".json")
  ).filter((file: string) => !file.includes("/build-info/"));

  for (const jsonFile of jsonFiles) {
    const dir = path.dirname(jsonFile);
    const filename = path.basename(jsonFile, ".json");
    const tsFile = path.join(dir, `${filename}.ts`);

    // Convert filename to lowercase for base export name
    let exportName = filename.toLowerCase();

    // If name already exists, append parent folder name
    if (exportNames.has(exportName)) {
      const relativePath = path.relative("./build/artifacts/forge", jsonFile);
      const parentFolder = path.dirname(relativePath);
      const immediateParent = path.basename(parentFolder);

      if (immediateParent && immediateParent !== ".") {
        // Clean the parent folder name: remove .sol extension, special chars, convert to lowercase
        const cleanParent = immediateParent
          .replace(/\.sol$/, "")
          .toLowerCase()
          .replace(/[^a-zA-Z0-9]/g, "");
        exportName = `${filename.toLowerCase()}_${cleanParent}`;
      }
    }

    // If still duplicated, add number suffix.
    let counter = 1;
    const originalExportName = exportName;
    while (exportNames.has(exportName)) {
      exportName = `${originalExportName}${counter}`;
      counter++;
    }

    exportNames.add(exportName);

    // Read JSON content and create TypeScript file
    const jsonContent = await fs.readFile(jsonFile, "utf8");
    const tsContent = `export const ${exportName} = ${jsonContent} as const;\n`;
    await fs.writeFile(tsFile, tsContent);
    if (debug) {
      console.log(`Created "${tsFile}" (exported as ${exportName})`);
    }

    // Add export to mod.ts
    const relativePath = path.relative("./build", tsFile).replace(/\\/g, "/");
    modContent += `export { ${exportName} } from './${relativePath}';\n`;
  }
  modContent += `export { contracts } from './contracts.ts';\n`;

  await fs.writeFile(modFile, modContent);
  if (debug) {
    console.log(`Created "${modFile}" with ${jsonFiles.length} exports`);  
  }
}

async function buildModFile(): Promise<void> {

  // First get the folder names under ./ignition/deployments/
  // They will match chain-<chainId>
  const chainDeploymentsFolder = "./ignition/deployments";
  const folderContents = await fs.readdir(chainDeploymentsFolder);
  const chainFiles = [];
  const chainLets = [];
  const chainIds = [];
  const chainToIndex: Record<string, number> = {};
  // filter the folders only
  let index = 1;
  for (const file of folderContents) {
    const stats = await fs.stat(path.join(chainDeploymentsFolder, file));
    if (stats.isDirectory()) {
      const chainId = file.replace("chain-", "");

      chainFiles.push(`const file${index} = __dirname + "/ignition/deployments/${file}/deployed_addresses.json";`);
      chainLets.push(`let chain${chainId}: Record<string, \`0x\${string}\`> = {};`);
      chainIds.push(chainId);
      chainToIndex[`chain${chainId}`] = index;
      index++;
    }
  }

  // Copy mod.ts to root and update paths to include ./build/ prefix
  const rootModContent = `// this is a auto-generated file.
import fs from "node:fs";
export * from "./build/mod.ts";
export { contracts } from "./build/contracts.ts";
const __dirname = import.meta.dirname ?? "";
export const contractAddressesEvmMain: () => Record<
${chainIds.map((chainId) => `"chain${chainId}"`).join(" | ")}, 
  Record<string, \`0x\${string}\`>> = () => {

  ${chainFiles.join("\n  ")}

  ${chainLets.join("\n  ")}

  ${chainIds.map((chainId) => `
  if (fs.statSync(file${chainToIndex[`chain${chainId}`]}).isFile()) {
    chain${chainId} = JSON.parse(fs.readFileSync(file${chainToIndex[`chain${chainId}`]}, 'utf-8'));
  }`).join("\n")}

  return {
    ${chainIds.map((chainId) => `chain${chainId}`).join(",\n    ")}
  };
}
`;

  await fs.writeFile("./mod.ts", rootModContent);
  if (debug) {
    console.log(`Created "./mod.ts" exports`);
  }
}

async function main(): Promise<void> {
  console.log("Building mod.ts...");
  await buildContracts();
  await buildTypeScriptArtifacts();
  await buildModFile();
}

// Run the main function
main().catch(console.error);
