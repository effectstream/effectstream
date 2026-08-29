/*
 * This script is used to update the version of @effectstream/ packages in the
 * templates (and the deprecated @paimaexample/ ones still pinned by the legacy
 * templates — each dependency keeps whichever scope it already uses).
 *
 *  usage:
 *  bun run update-packages.ts --version 1.0.0 --package <name> --dry-run
 *  bun run update-packages.ts --version 1.2.3 --all-packages --apply
 */

import { parseArgs } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, stat, readFile, writeFile, rm } from "node:fs/promises";

async function* walkJsonFiles(dir: string, pattern: RegExp): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      yield* walkJsonFiles(fullPath, pattern);
    } else if (entry.isFile() && entry.name.endsWith(".json") && pattern.test(entry.name)) {
      yield fullPath;
    }
  }
}

async function isTemplateDirectory(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, "package.json"));
    return true;
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  return false;
}

// 1. Read args. Args should contain
// --version x.y.z
// --package <name> or --all-packages
// --apply or --dry-run
async function main(): Promise<void> {
  const { values: flags } = parseArgs({
    args: process.argv.slice(2),
    options: {
      version: { type: "string" },
      package: { type: "string" },
      "all-packages": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
    strict: false,
  });

  const version = flags.version;
  const packageName = flags.package;
  const allPackages = flags["all-packages"];
  const apply = flags.apply;

  if (!version) {
    console.error("Error: --version is required.");
    process.exit(1);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(
      `Error: Invalid version format "${version}". Please use x.y.z.`,
    );
    process.exit(1);
  }

  if (!!packageName === !!allPackages) {
    console.error(
      "Error: Either --package or --all-packages must be specified, but not both.",
    );
    process.exit(1);
  }

  const dryRun = !apply;
  console.log(`Running in ${dryRun ? "dry-run" : "apply"} mode.`);

  // 2. if --package, the check if the folder exists (in the same folder of this file) and folder/package.json exists
  // 2.b if --all-packages, get the name of the folders that have a package.json file.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packageDirs: string[] = [];

  if (packageName) {
    const packagePath = join(__dirname, packageName);
    if (await isTemplateDirectory(packagePath)) {
      packageDirs.push(packagePath);
    } else {
      console.error(
        `Error: Template "${packageName}" not found or has no recognized entrypoint.`,
      );
      process.exit(1);
    }
  } else if (allPackages) {
    const entries = await readdir(__dirname, { withFileTypes: true });
    for (const entry of entries) {
      const templatePath = join(__dirname, entry.name);
      if (entry.isDirectory() && await isTemplateDirectory(templatePath)) {
        packageDirs.push(templatePath);
      }
    }
  }

  // 3. Print packages and version to be updated.
  console.log("Packages to be updated:");
  packageDirs.forEach((dir) => console.log(`- ${dir.split("/").pop()}`));
  console.log(`New version: ${version}`);

  // The scope is captured rather than hard-coded, so each dependency keeps the
  // scope it already had. @paimaexample is the deprecated one and survives only
  // in the legacy templates (dice, rock-paper-scissors, multi-chain-token-transfer);
  // everything current is @effectstream. Hard-coding @paimaexample here meant the
  // script silently rewrote nothing on a modern template while still deleting its
  // bun.lock — it reported success having changed no versions at all.
  const denoJsonRegex =
    /(jsr|npm):@(paimaexample|effectstream)\/([\w-]+)@[\^~]?(\d+\.\d+\.\d+)/g;
  const packageJsonRegex =
    /"@(paimaexample|effectstream)\/([\w-]+)": "[\^~]?(\d+\.\d+\.\d+)"/g;

  for (const dir of packageDirs) {
    // 4. now for each package delete bun.lock and node_modules folder.
    if (!dryRun) {
      const bunLockPath = join(dir, "bun.lock");
      const nodeModulesPath = join(dir, "node_modules");

      try {
        await rm(bunLockPath);
        console.log(`Removed ${bunLockPath}`);
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }

      try {
        await rm(nodeModulesPath, { recursive: true });
        console.log(`Removed ${nodeModulesPath}`);
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    // 5. Search in the package, recursively, for each deno.json file and find the regex:
    //    (jsr|npm):@paimaexample/([\w-]+)@[.]?(\d+\.\d+\.\d+)
    // if --dry-run, print all the replacements to be made.
    // if --apply, make the replacements with the new version
    //     $1:@paimaexample/$2@x.y.z
    for await (const filePath of walkJsonFiles(dir, /deno\.json$/)) {
      const content = await readFile(filePath, "utf-8");
      const matches = [...content.matchAll(denoJsonRegex)];

      if (matches.length > 0) {
        if (dryRun) {
          console.log(`\n[dry-run] Changes for ${filePath}:`);
          for (const match of matches) {
            const newDep = `${match[1]}:@${match[2]}/${match[3]}@${version}`;
            console.log(`  - ${match[0]} -> ${newDep}`);
          }
        } else {
          console.log(`\nUpdating ${filePath}...`);
          const newContent = content.replace(
            denoJsonRegex,
            `$1:@$2/$3@${version}`,
          );
          await writeFile(filePath, newContent);
          console.log(`Successfully updated ${filePath}`);
        }
      }
    }

    for await (const filePath of walkJsonFiles(dir, /package\.json$/)) {
      const content = await readFile(filePath, "utf-8");
      const matches = [...content.matchAll(packageJsonRegex)];

      if (matches.length > 0) {
        if (dryRun) {
          console.log(`\n[dry-run] Changes for ${filePath}:`);
          for (const match of matches) {
            const newDep = `"@${match[1]}/${match[2]}": "${version}"`;
            console.log(`  - ${match[0]} -> ${newDep}`);
          }
        } else {
          console.log(`\nUpdating ${filePath}...`);
          const newContent = content.replace(
            packageJsonRegex,
            `"@$1/$2": "${version}"`,
          );
          await writeFile(filePath, newContent);
          console.log(`Successfully updated ${filePath}`);
        }
      }
    }
  }
}

if (import.meta.main) {
  main();
}
