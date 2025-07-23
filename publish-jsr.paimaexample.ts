/**
 * Paima Engine JSR Package Publisher
 *
 * This script handles the publishing of Paima Engine packages to JSR (JavaScript Registry).
 * It can replace package references between @paima and @paimaexample namespaces and
 * automatically increment versions for publishing.
 *
 * USAGE:
 *   deno run -A publish-jsr.paimaexample.ts [options] [directory]
 *
 * FLAGS:
 *   --publish          Actually publish the packages to JSR (default: dry-run mode)
 *   --reverse          Reverse the namespace replacement (@paimaexample -> @paima)
 *   --version <ver>    Use a specific version instead of auto-incrementing
 *
 * EXAMPLES:
 *   # Dry run - show what would be published
 *   deno run -A publish-jsr.paimaexample.ts
 *
 *   # Actually publish packages
 *   deno run -A publish-jsr.paimaexample.ts --publish
 *
 *   # Use specific version
 *   deno run -A publish-jsr.paimaexample.ts --publish --version 1.2.3
 *
 *   # Reverse namespace replacement
 *   deno run -A publish-jsr.paimaexample.ts --reverse
 *
 *   # Process specific directory
 *   deno run -A publish-jsr.paimaexample.ts /path/to/directory
 *
 * BEHAVIOR:
 * - By default, replaces @paima/ references with @paimaexample/ in all .ts, .js, and .json files
 * - Auto-increments patch version in deno.json files (fetches latest from JSR)
 * - Publishes packages in dependency order to ensure proper versioning
 * - Skips node_modules directories
 * - Without --publish flag, shows what commands would be executed
 */

const shouldPublish = Deno.args.includes("--publish");
const shouldReverse = Deno.args.includes("--reverse");
const versionIndex = Deno.args.indexOf("--version");
const manualVersion = versionIndex !== -1 ? Deno.args[versionIndex + 1] : null;

// Find the first argument that's not a flag and not a version value
const dirArg = Deno.args.find((arg, index) => {
  // Skip if it's a flag
  if (arg.startsWith("--")) return false;
  // Skip if it's the value after --version
  if (index > 0 && Deno.args[index - 1] === "--version") return false;
  return true;
});
const rootDir = dirArg || Deno.cwd();

const filePattern = /\.(ts|js|json)$/i;

// Packages to publish in order
const packagesToPublish = [
  "./packages/paima-sdk/utils",
  "./docs/site",
  "./packages/paima-sdk/config",
  "./packages/paima-sdk/log",
  "./packages/paima-sdk/coroutine",
  "./packages/node-sdk/db",
  "./packages/paima-sdk/precompile",
  "./packages/paima-sdk/chain-types",
  "./packages/paima-sdk/concise",
  "./packages/node-sdk/sync",
  "./packages/paima-sdk/crypto",
  "./packages/node-sdk/sm",
  "./packages/node-sdk/runtime",
  "./packages/node-sdk/batcher",
  "./packages/chains/evm/contracts",
  "./packages/build-tools/explorer",
  "./packages/build-tools/tui",
  "./packages/build-tools/collector",
  "./packages/build-tools/orchestrator",
];

let versionCache: string | null = null;
async function fetchLatestVersion(): Promise<string> {
  // If manual version is provided, use it
  if (manualVersion) {
    console.log(`Using manual version: ${manualVersion}`);
    return manualVersion;
  }
  if (versionCache) {
    return versionCache;
  }

  try {
    const response = await fetch("https://jsr.io/@paimaexample/sync/meta.json");
    if (!response.ok) {
      throw new Error(`Failed to fetch version: ${response.statusText}`);
    }
    const data = await response.json();
    const currentVersion = data.latest;

    // Increment minor version
    const versionParts = currentVersion.split(".");
    const major = parseInt(versionParts[0]);
    const minor = parseInt(versionParts[1]);
    const patch = parseInt(versionParts[2]);

    const newVersion = `${major}.${minor}.${patch + 1}`;
    console.log(`Auto-incremented version: ${newVersion}`);
    versionCache = newVersion;
    return newVersion;
  } catch (error) {
    console.error("Error fetching version:", error);
    throw error;
  }
}

async function processFile(filePath: string, reverse: boolean = false) {
  const content = await Deno.readTextFile(filePath);
  let newContent = content;
  let didUpdate = false;

  if (!reverse) {
    newContent = newContent.replace(
      /@paima\/(?!pgtyped-cli)([\w-]+)/g,
      "@paimaexample/$1",
    );
  } else {
    newContent = newContent.replace(
      /@paimaexample\/([\w-]+)/g,
      "@paima/$1",
    );
  }

  // If this is a deno.json, update the version (both forward and reverse)
  if (filePath.endsWith("deno.json")) {
    const updateVersion = await fetchLatestVersion();
    const versionRegex = /"version":\s*".+?",/;
    if (versionRegex.test(newContent)) {
      newContent = newContent.replace(
        versionRegex,
        `"version": "${updateVersion}",`,
      );
      didUpdate = true;
    }
  }

  if (newContent !== content) {
    await Deno.writeTextFile(filePath, newContent);
    console.log(`Updated: ${filePath}`);
  } else if (didUpdate) {
    // If only version was updated, still log
    console.log(`Version updated: ${filePath}`);
  }
}

async function walkAndProcess(dir: string, reverse: boolean = false) {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      // Skip node_modules folder
      if (entry.name === "node_modules") {
        continue;
      }
      await walkAndProcess(fullPath, reverse);
    } else if (filePattern.test(entry.name)) {
      // Skip the script file itself to avoid self-modification
      if (entry.name === "publish-jsr.paimaexample.ts") {
        continue;
      }
      await processFile(fullPath, reverse);
    }
  }
}

async function publishPackages() {
  console.log("Starting package publishing...");

  for (const packagePath of packagesToPublish) {
    try {
      console.log(`Publishing ${packagePath}...`);

      // Change to the package directory
      const originalCwd = Deno.cwd();
      Deno.chdir(packagePath);

      // Run the publish command
      const command = new Deno.Command("deno", {
        args: ["publish", "--allow-slow-types", "--allow-dirty", "--no-check"],
        stdout: "inherit",
        stderr: "inherit",
      });

      const { success } = await command.output();

      if (!success) {
        console.error(`Failed to publish ${packagePath}`);
        Deno.chdir(originalCwd);
        return;
      }

      console.log(`Successfully published ${packagePath}`);

      // Return to original directory
      Deno.chdir(originalCwd);
    } catch (error) {
      console.error(`Error publishing ${packagePath}:`, error);
      return;
    }
  }

  console.log("All packages published successfully!");
}

async function showPublishCommands() {
  const version = await fetchLatestVersion();
  console.log(`Version that would be used: ${version}`);
  console.log("Publish commands that would be executed:");
  console.log("(Run with --publish flag to actually execute these commands)");
  console.log("");

  for (const packagePath of packagesToPublish) {
    console.log(`cd ${packagePath}`);
    console.log(`deno publish --allow-slow-types --allow-dirty --no-check`);
    console.log(
      `cd ${Array(packagePath.split("/").length - 1).fill("..").join("/")}/`,
    );
    console.log("");
  }
}

async function main() {
  if (shouldReverse) {
    console.log("Starting reverse replacement...");
    await walkAndProcess(rootDir, true);
  } else {
    console.log("Starting replacement...");
    await walkAndProcess(rootDir, false);
  }

  if (shouldPublish) {
    await publishPackages();
  } else {
    await showPublishCommands();
  }

  console.log("Complete!");
}

main().catch(console.error);
