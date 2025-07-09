#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
const __dirname = import.meta.dirname ?? "";

// Helper function to ensure directory exists
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

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

// Helper function to copy directory recursively
function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper function to copy files matching pattern
function copyFiles(srcPattern: string, destDir: string): void {
  const srcDir = path.dirname(srcPattern);
  const files = findFiles(srcDir, "");
  ensureDir(destDir);

  for (const file of files) {
    const filename = path.basename(file);
    const destPath = path.join(destDir, filename);
    fs.copyFileSync(file, destPath);
  }
}

async function main(): Promise<void> {
  console.log("Starting preparation...");

  // Create build directories
  ensureDir("./build");
  ensureDir("./build/contracts");
  ensureDir("./build/companion-abi");
  ensureDir("./build/plugin");

  // Copy directories and files
  copyDir("./src/contracts", "./build/contracts");
  copyFiles("./src/companions/*", "./build/companion-abi");
  copyFiles("./src/plugin/*", "./build/plugin");
  fs.copyFileSync(
    "./src/recommendedHardhat.ts",
    "./build/recommendedHardhat.ts",
  );
  fs.copyFileSync("./README.md", "./build/README.md");

  // Create contracts file with contract names and absolute paths
  console.log("Creating contracts file...");
  const contractsFile = "./build/contracts.ts";

  let contractsContent = `
// this is a auto generated file, do not edit it manually
import path from "node:path";
const __dirname = import.meta.dirname ?? "";
export const contracts = {\n`;

  // Find all .sol files in the contracts directory
  const solFiles = findFiles("./build/contracts", ".sol");

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

  // Process Forge artifacts: convert JSON files to TypeScript exports
  console.log("Processing Forge artifacts...");

  const forgeArtifactsDir = "./build/artifacts/forge";
  if (fs.existsSync(forgeArtifactsDir)) {
    const modFile = "./build/mod.ts";
    let modContent = "";

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
      console.log(`Created: ${tsFile} (exported as ${exportName})`);
    }
    modContent += `export { contracts } from './contracts.ts';\n`;

    fs.writeFileSync(modFile, modContent);
    console.log(
      `Created mod.ts with ${modContent.split("\n").length - 1} exports`,
    );

    // Copy mod.ts to root and update paths to include ./build/ prefix
    const rootModContent = modContent.replace(/from '\.\//g, "from './build/");
    fs.writeFileSync("./mod.ts", rootModContent);
    console.log("Created root mod.ts with updated paths");

    console.log("Forge artifact processing complete!");
  } else {
    console.log("No forge artifacts found, skipping TypeScript generation.");
  }

  console.log("Preparation complete!");
}

// Run the main function
main().catch(console.error);
