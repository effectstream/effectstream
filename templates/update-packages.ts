/*
 * This script is used to update the version of @paima/ packages in the templates.
 *
 *  usage:
 *  deno run -A update-packages.ts --version 1.0.0 --package <name> --dry-run
 *  deno run -A update-packages.ts --version 1.2.3 --all-packages --apply
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import {
  dirname,
  fromFileUrl,
  join,
} from "jsr:@std/path";
import { walk } from "jsr:@std/fs";

// 1. Read args. Args should contain
// --version x.y.z
// --package <name> or --all-packages
// --apply or --dry-run
async function main(): Promise<void> {
  const flags = parseArgs(Deno.args, {
    string: ["version", "package"],
    boolean: ["all-packages", "apply"],
    default: { apply: false },
  });

  const { version, package: packageName, "all-packages": allPackages, apply } =
    flags;

  if (!version) {
    console.error("Error: --version is required.");
    Deno.exit(1);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(
      `Error: Invalid version format "${version}". Please use x.y.z.`,
    );
    Deno.exit(1);
  }

  if (!!packageName === allPackages) {
    console.error(
      "Error: Either --package or --all-packages must be specified, but not both.",
    );
    Deno.exit(1);
  }

  const dryRun = !apply;
  console.log(`Running in ${dryRun ? "dry-run" : "apply"} mode.`);

  // 2. if --package, the check if the folder exists (in the same folder of this file) and folder/deno.json exists
  // 2.b if --all-packages, get the name of the folders that have a deno.json file.
  const __dirname = dirname(fromFileUrl(import.meta.url));
  const packageDirs: string[] = [];

  if (packageName) {
    const packagePath = join(__dirname, packageName);
    try {
      await Deno.stat(join(packagePath, "deno.json"));
      packageDirs.push(packagePath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.error(
          `Error: Package "${packageName}" not found or does not contain a deno.json file.`,
        );
        Deno.exit(1);
      }
      throw error;
    }
  } else if (allPackages) {
    for await (const dirEntry of Deno.readDir(__dirname)) {
      if (dirEntry.isDirectory) {
        try {
          await Deno.stat(join(__dirname, dirEntry.name, "deno.json"));
          packageDirs.push(join(__dirname, dirEntry.name));
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            // Not a package, ignore.
          } else {
            throw error;
          }
        }
      }
    }
  }

  // 3. Print packages and version to be updated.
  console.log("Packages to be updated:");
  packageDirs.forEach((dir) => console.log(`- ${dir.split("/").pop()}`));
  console.log(`New version: ${version}`);

  const denoJsonRegex = /(jsr|npm):@paimaexample\/([\w-]+)@[\^~]?(\d+\.\d+\.\d+)/g;
  const packageJsonRegex = /"@paimaexample\/([\w-]+)": "[\^~]?(\d+\.\d+\.\d+)"/g;

  for (const dir of packageDirs) {
    // 4. now for each package delete deno.lock and node_modules folder.
    if (!dryRun) {
      const denoLockPath = join(dir, "deno.lock");
      const nodeModulesPath = join(dir, "node_modules");

      try {
        await Deno.remove(denoLockPath);
        console.log(`Removed ${denoLockPath}`);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }

      try {
        await Deno.remove(nodeModulesPath, { recursive: true });
        console.log(`Removed ${nodeModulesPath}`);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }
    }

    // 5. Search in the package, recursively, for each deno.json file and find the regex:
    //    (jsr|npm):@paimaexample/([\w-]+)@[.]?(\d+\.\d+\.\d+)
    // if --dry-run, print all the replacements to be made.
    // if --apply, make the replacements with the new version
    //     $1:@paimaexample/$2@x.y.z
    for await (
      const entry of walk(dir, {
        includeFiles: true,
        includeDirs: false,
        exts: [".json"],
        match: [/deno\.json$/],
      })
    ) {
      const filePath = entry.path;
      const content = await Deno.readTextFile(filePath);
      const matches = [...content.matchAll(denoJsonRegex)];

      if (matches.length > 0) {
        if (dryRun) {
          console.log(`\n[dry-run] Changes for ${filePath}:`);
          for (const match of matches) {
            const newDep = `${match[1]}:@paimaexample/${match[2]}@${version}`;
            console.log(`  - ${match[0]} -> ${newDep}`);
          }
        } else {
          console.log(`\nUpdating ${filePath}...`);
          const newContent = content.replace(
            denoJsonRegex,
            `$1:@paimaexample/$2@${version}`,
          );
          await Deno.writeTextFile(filePath, newContent);
          console.log(`Successfully updated ${filePath}`);
        }
      }
    }

    for await (
      const entry of walk(dir, {
        includeFiles: true,
        includeDirs: false,
        exts: [".json"],
        match: [/package\.json$/],
      })
    ) {
      const filePath = entry.path;
      const content = await Deno.readTextFile(filePath);
      const matches = [...content.matchAll(packageJsonRegex)];

      if (matches.length > 0) {
        if (dryRun) {
          console.log(`\n[dry-run] Changes for ${filePath}:`);
          for (const match of matches) {
            const newDep = `"@paimaexample/${match[1]}": "${version}"`;
            console.log(`  - ${match[0]} -> ${newDep}`);
          }
        } else {
          console.log(`\nUpdating ${filePath}...`);
          const newContent = content.replace(
            packageJsonRegex,
            `"@paimaexample/$1": "${version}"`,
          );
          await Deno.writeTextFile(filePath, newContent);
          console.log(`Successfully updated ${filePath}`);
        }
      }
    }
  }
}

if (import.meta.main) {
  main();
}
