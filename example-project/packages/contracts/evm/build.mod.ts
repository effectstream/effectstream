import fs from "node:fs";
import path from "node:path";

// Helper function to find files matching a pattern
function findFiles(dir: string, pattern: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, pattern));
    } else if (entry.isFile() && entry.name.endsWith(pattern)) {
      files.push(fullPath);
    }
  }
  return files;
}
/** Build a map of contract names to their paths. */
async function buildContracts(): Promise<void> {
  const contractsFile = "./build/contracts.ts";

  let contractsContent =
    `// this is a auto generated file, do not edit it manually

import path from "node:path";
const __dirname = import.meta.dirname ?? "";
export const contracts = {\n`;

  // Find all .sol files in the contracts directory
  const solFiles = findFiles("./src/contracts", ".sol");

  for (const solFile of solFiles) {
    const filename = path.basename(solFile, ".sol");
    // const relativePath = path.relative(solFile, __dirname);
    contractsContent += `  "${filename}": path.join(__dirname, "${
      solFile.replace(/^build\//, "")
    }"),\n`;
  }

  contractsContent += "} as const;\n";

  fs.writeFileSync(contractsFile, contractsContent);

  const contractCount = solFiles.length;
  console.log(`Created contracts file with ${contractCount} contract entries`);
}

/** Build a mod.ts file that exports the contracts ABI in .ts format compatible with viem */
async function buildMod(): Promise<void> {
  // Process Forge artifacts: convert JSON files to TypeScript exports
  const forgeArtifactsDir = "./build/artifacts/forge";
  if (fs.existsSync(forgeArtifactsDir)) {
    const modFile = "./build/mod.ts";
    let modContent =
      "// this is a auto generated file, do not edit it manually\n\n";

    // Track export names to avoid duplicates
    const exportNames = new Set<string>();

    // Find all JSON files and process them (skip build-info folder)
    const jsonFiles = findFiles("./build/artifacts/forge", ".json")
      .filter((file: string) => !file.includes("/build-info/"));

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

      // If still duplicated, add numbers
      let counter = 1;
      const originalExportName = exportName;
      while (exportNames.has(exportName)) {
        exportName = `${originalExportName}${counter}`;
        counter++;
      }

      exportNames.add(exportName);

      // Read JSON content and create TypeScript file
      const jsonContent = fs.readFileSync(jsonFile, "utf8");
      const tsContent =
        `export const ${exportName} = ${jsonContent} as const;\n`;
      fs.writeFileSync(tsFile, tsContent);

      // Add export to mod.ts
      const relativePath = path.relative("./build", tsFile).replace(/\\/g, "/");
      modContent += `export { ${exportName} } from './${relativePath}';\n`;
      // console.log(`Created: ${tsFile} (exported as ${exportName})`);
    }
    modContent += `export { contracts } from './contracts.ts';\n`;

    fs.writeFileSync(modFile, modContent);

    // Copy mod.ts to root and update paths to include ./build/ prefix
    let rootModContent = `// this is a auto generated file.

export * from "./build/mod.ts";
export { contracts } from "./build/contracts.ts";
`;

    if (fs.existsSync("./deploy.ts")) {
      rootModContent += `export * from "./deploy.ts";\n`;
    }

    rootModContent += `
// This a placeholder for evm contract addresses.
// TODO This script should read the current /ignition/deployments/chain-* to generate the addresses list.
const __dirname = import.meta.dirname ?? "";
export const contractAddressesEvmMain: () => Record<
  "chain31337" | "chain31338",
  Record<string, \`0x\${string}\`>
> = () => {
  // TODO Create this dynamically with the mod.ts deployment script.
  const file1 = __dirname +
    "/ignition/deployments/chain-31337/deployed_addresses.json";
  const file2 = __dirname +
    "/ignition/deployments/chain-31338/deployed_addresses.json";

  let chain31337: Record<string, \`0x\${string}\`> = {};
  if (Deno.statSync(file1).isFile) {
    chain31337 = JSON.parse(Deno.readTextFileSync(file1));
  }
  let chain31338: Record<string, \`0x\${string}\`> = {};
  if (Deno.statSync(file2).isFile) {
    chain31338 = JSON.parse(Deno.readTextFileSync(file2));
  }

  return {
    chain31337,
    chain31338,
  };
};
`;

    fs.writeFileSync("./mod.ts", rootModContent);
    console.log(
      `Created mod.ts with ${jsonFiles.length} exports`,
    );
  } else {
    console.log("No forge artifacts found, skipping TypeScript generation.");
  }
}

async function main(): Promise<void> {
  console.log("Starting building mod.ts...");
  await buildContracts();
  await buildMod();
}

// Run the main function
main().catch(console.error);
