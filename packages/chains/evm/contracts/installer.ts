import path from "node:path";
import { cp, readFileSync } from "node:fs";

/*
 * This installer scalafolds the contents of the package into the target directory.
 * This allows the user to start with a proyect with all default and helper contracts.
 */
const targetDir = Deno.env.get("INIT_CWD");
const packageDir = import.meta.dirname;

if (!targetDir || !packageDir) {
  console.log("Error: Target directory or package directory is not set.");
  Deno.exit(0);
}
if (targetDir === packageDir) {
  console.log(
    "Error: Target directory is the same as the package directory.",
  );
  console.log("Usage `deno task -f @paima/evm-contracts init`");
  Deno.exit(0);
}

const files = Deno.readDirSync(targetDir);
for (const _ of files) {
  console.log(
    "The target directory is not empty. Please move to a empty directory and run the installer again.",
  );
  Deno.exit(0);
}

if (
  !confirm(
    `This installer will create a new project for EVM Contrats at ${targetDir}. Do you want to proceed?`,
  )
) {
  console.log(
    "Please move to the directory you want to create the project in and run the installer again.",
  );
  Deno.exit(0);
}

// Recursive copy.
const copyPromise = (from: string, to: string) =>
  new Promise((resolve, reject) => {
    cp(from, to, (err) => {
      if (err) return reject(err);
      return resolve(true);
    });
  });

const contentsDir = path.join(packageDir, "package");
const contentsFiles = Deno.readDirSync(contentsDir);

for (const file of contentsFiles) {
  await copyPromise(
    path.join(contentsDir, file.name),
    path.join(targetDir, file.name),
  );
}

// Rename special files.
const copySpecialFiles = async (from: string, to: string) => {
  await Deno.copyFile(from, to);
  await Deno.remove(from);
};

const denoJsonSrc = path.join(targetDir, "deno.example.json");
const denoJsonTarget = path.join(targetDir, "deno.json");
await copySpecialFiles(denoJsonSrc, denoJsonTarget);

const packageJsonSrc = path.join(targetDir, "package.example.json");
const packageJsonTarget = path.join(targetDir, "package.json");
await copySpecialFiles(packageJsonSrc, packageJsonTarget);

const hardhatConfigSrc = path.join(targetDir, "hardhat.config.example.ts");
const hardhatConfigTarget = path.join(targetDir, "hardhat.config.ts");
await copySpecialFiles(hardhatConfigSrc, hardhatConfigTarget);

const name = prompt(
  "Select a namespace for your contracts project (default: @my-project/evm-contracts)",
  "@my-project/evm-contracts",
) ?? "";
const denoJson = await Deno.readTextFile(denoJsonTarget);
await Deno.writeTextFile(
  denoJsonTarget,
  denoJson.replaceAll("@placeholder/evm-contracts", name),
);

console.log(`
To finish the installation, run:

> deno install && deno task patch-foundry && deno task build:contracts

To deploy the contracts, run:

> deno task deploy

`);
