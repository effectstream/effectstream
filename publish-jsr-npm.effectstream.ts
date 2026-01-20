/**
 * Paima Engine JSR Package Publisher
 *
 * This script handles the publishing of Paima Engine packages to JSR (JavaScript Registry).
 * It can replace package references between @effectstream and @effectstream-alt namespaces and
 * automatically increment versions for publishing.
 *
 * USAGE:
 *   deno run -A publish-jsr.effectstream.ts [options] [directory]
 *
 * FLAGS:
 *   --publish          Actually publish the packages to JSR (default: dry-run mode)
 *   --reverse          Reverse the namespace replacement (@effectstream -> @effectstream-alt)
 *   --version <ver>    Use a specific version instead of auto-incrementing
 *   --token <token>    Authentication token for JSR publishing
 *   --otp <code>       One-time password for npm publishing (enables npm publishing when used with --publish)
 *   --dir <path>       Directory to process (default: current working directory)
 *   --skip-prepublish  Skip the pre-publish phase (builds etc.)
 *   --only-prepublish  Exit after the pre-publish phase is done
 *
 * EXAMPLES:
 *   # Dry run - show what would be published
 *   deno run -A publish-jsr.effectstream.ts
 *
 *   # Actually publish packages
 *   deno run -A publish-jsr.effectstream.ts --publish
 *
 *   # Use specific version
 *   deno run -A publish-jsr.effectstream.ts --publish --version 1.2.3
 *
 *   # Use authentication token
 *   deno run -A publish-jsr.effectstream.ts --publish --token your-token-here
 *
 *   # Publish with npm OTP (enables npm publishing)
 *   deno run -A publish-jsr.effectstream.ts --publish --otp your-otp-code
 *
 *   # Reverse namespace replacement
 *   deno run -A publish-jsr.effectstream.ts --reverse
 *
 *   # Process specific directory
 *   deno run -A publish-jsr.effectstream.ts --dir /path/to/directory
 *
 * BEHAVIOR:
 * - By default, replaces @effectstream/ references with @effectstream/ in all .ts, .js, and .json files
 * - Auto-increments patch version in deno.json and package.json files (fetches latest from JSR)
 * - Publishes packages in dependency order to ensure proper versioning
 * - Skips node_modules directories
 * - Without --publish flag, shows what commands would be executed
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import * as path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const shouldPublish = args.includes("--publish");
const shouldReverse = args.includes("--reverse");
const versionIndex = args.indexOf("--version");
const manualVersion = versionIndex !== -1 ? args[versionIndex + 1] : null;
const tokenIndex = args.indexOf("--token");
const authToken = tokenIndex !== -1 ? args[tokenIndex + 1] : null;
const otpIndex = args.indexOf("--otp");
const otpCode = otpIndex !== -1 ? args[otpIndex + 1] : null;
const dirIndex = args.indexOf("--dir");
const rootDir = dirIndex !== -1 ? args[dirIndex + 1] : process.cwd();
const skipPrepublish = args.includes("--skip-prepublish");
const onlyPrepublish = args.includes("--only-prepublish");

const filePattern = /\.(ts|js|json|tsx|jsx|tmux)$/i;

async function fetchLatestVersion(): Promise<string> {
  // If manual version is provided, use it
  if (manualVersion) {
    console.log(`Using manual version: ${manualVersion}`);
    return manualVersion;
  }
  const denoFile = (await fs.readFile("./deno.json", "utf8")).replace(
    /\/\/.+?$/gm,
    "",
  );
  return JSON.parse(denoFile).version;
}


// Packages to publish in order
const jsrPackagesToPublish: { path: string; prepublish?: string[] }[] = [
  // /* Paima SDK */
  { path: "./packages/effectstream-sdk/utils" },
  { path: "./packages/effectstream-sdk/log" }, // ["@utils"]},
  { path: "./packages/effectstream-sdk/config" },
  { path: "./packages/effectstream-sdk/precompile" },
  { path: "./packages/effectstream-sdk/chain-types" }, // [@utils, @config]
  { path: "./packages/effectstream-sdk/crypto" },
  { path: "./packages/effectstream-sdk/concise" }, // [@chain-types, @precompile, @crypto]
  { path: "./packages/effectstream-sdk/events" },
  // { path: "./packages/effectstream-sdk/wallets" }, // [@concise, @crypto, @events-client]
  { path: "./packages/effectstream-sdk/coroutine" },

  // /* Docs */
  // {path: "./docs/site" },

  // /* Node SDK */
  { path: "./packages/node-sdk/db" },
  { path: "./packages/node-sdk/sync" }, // [@db]
  { path: "./packages/node-sdk/sm" }, // [@db]
  { path: "./packages/node-sdk/db-emulator" }, // [@db, @sm]
  { path: "./packages/node-sdk/events" },
  { path: "./packages/node-sdk/runtime" }, // [@db, @sync, @sm]
  { path: "./packages/chains/midnight-contracts" },
  { path: "./packages/build-tools/explorer", prepublish: ["task", "build"] }, // @utils
  { path: "./packages/build-tools/tui" },
  { path: "./packages/build-tools/orchestrator" },
  { path: "./packages/chains/evm-hardhat" },
  { path: "./packages/chains/evm-contracts" }, // [@evm-hardhat]
  { path: "./packages/chains/bitcoin-contracts" },
  { path: "./packages/batcher" },
];

const npmPackagesToPublish: { path: string; prepublish?: string[], build?: string }[] = [
  { path: "./packages/chains/evm-contracts" },
  { path: "./packages/binaries/bitcoin-core" },
  { path: "./packages/binaries/ord" },
  { path: "./packages/binaries/avail-light-client" },
  { path: "./packages/binaries/avail-node" },
  { path: "./packages/binaries/midnight-indexer" },
  { path: "./packages/binaries/midnight-node" },
  { path: "./packages/binaries/midnight-proof-server" },
  { path: "./packages/binaries/grafana-alloy" },
  { path: "./packages/binaries/grafana-loki" },
  { path: "./packages/build-tools/explorer", prepublish: ["task", "build"] }, // @utils
  { path: "./packages/effectstream-sdk/wallets", prepublish: ["task", "build:npm", await fetchLatestVersion()], build: 'npm'  },
];

async function processFile(filePath: string, reverse: boolean = false) {
  const content = await fs.readFile(filePath, "utf8");
  let newContent = content;
  let didUpdate = false;

  // Special handling for evm-hardhat/deno.json - log package must stay as @paimaexample/log
  const isEvmHardhatDenoJson = filePath.includes("evm-hardhat/deno.json");
  
  // Special handling for orchestrator/start.ts - grafana packages need npm: prefix when publishing
  const isOrchestratorStartTs = filePath.includes("orchestrator/src/start.ts");

  if (!reverse) {
    // For orchestrator/start.ts, grafana packages need npm: prefix
    if (isOrchestratorStartTs) {
      newContent = newContent.replace(
        /@effectstream\/grafana-(alloy|loki)/g,
        "npm:@paimaexample/grafana-$1",
      );
    }
    
    newContent = newContent.replace(
      /@effectstream\/(?!pgtyped-cli)([\w-]+)/g,
      "@paimaexample/$1",
    );
  } else {
    // For orchestrator/start.ts, remove npm: prefix from grafana packages when reverting
    if (isOrchestratorStartTs) {
      newContent = newContent.replace(
        /npm:@paimaexample\/grafana-(alloy|loki)/g,
        "@effectstream/grafana-$1",
      );
    }
    
    // When reversing, exclude log from replacement only for evm-hardhat/deno.json
    // because it uses static import and the package doesn't exist as @effectstream/log on JSR
    if (isEvmHardhatDenoJson) {
      newContent = newContent.replace(
        /@paimaexample\/(?!log)([\w-]+)/g,
        "@effectstream/$1",
      );
    } else {
      newContent = newContent.replace(
        /@paimaexample\/([\w-]+)/g,
        "@effectstream/$1",
      );
    }
  }
  // Update session.tmux files - published should use @paimaexample, reverted should use @effectstream
  if (
    filePath.endsWith("session.tmux") || filePath.endsWith("session.tmux.ts")
  ) {
    if (!reverse) {
      // When publishing, convert @effectstream/ to @paimaexample/ (normal conversion)
      newContent = newContent.replace(
        /@effectstream\/(?!pgtyped-cli)([\w-]+)/g,
        "@paimaexample/$1",
      );
    } else {
      // When reverting, convert @paimaexample/ back to @effectstream/
      newContent = newContent.replace(
        /@paimaexample\/([\w-]+)/g,
        "@effectstream/$1",
      );
    }
  }
  // If this is a deno.json or package.json, update the version (both forward and reverse)
  if (filePath.endsWith("deno.json") || filePath.endsWith("package.json")) {
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
    await fs.writeFile(filePath, newContent, "utf8");
    console.log(`Updated: ${filePath}`);
  } else if (didUpdate) {
    // If only version was updated, still log
    console.log(`Version updated: ${filePath}`);
  }
}

const skipDirectories = [
  `${rootDir}/templates`,
  `${rootDir}/e2e`,
  `${rootDir}/docs/docs`,
  `${rootDir}/.github`,
];

async function walkAndProcess(dir: string, reverse: boolean = false) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules folder
      if (entry.name === "node_modules") {
        continue;
      }

      if (skipDirectories.includes(fullPath)) {
        continue;
      }

      await walkAndProcess(fullPath, reverse);
    } else if (filePattern.test(entry.name)) {
      // Skip the script file itself to avoid self-modification
      if (entry.name === "publish-jsr-npm.effectstream.ts") {
        continue;
      }
      if (entry.name === "deno.json" && dir === rootDir) {
        continue;
      }
      await processFile(fullPath, reverse);
    }
  }
}

async function publishJSRPackages() {
  console.log(Array(20).fill("-").join(""));
  console.log("Starting JSR package publishing...");
  console.log(Array(20).fill("-").join(""));
  // Change to the package directory
  const originalCwd = process.cwd();
  for (const packagePath of jsrPackagesToPublish) {
    try {
      console.log(`> Publishing ${packagePath.path}...`);
      process.chdir(packagePath.path);

      // Run the publish command
      const publishArgs = [
        "publish",
        "--allow-slow-types",
        "--allow-dirty",
        "--no-check",
      ];
      if (authToken) {
        publishArgs.push("--token", authToken);
      }

      const { success } = await runCommand("deno", publishArgs);

      if (!success) {
        console.error(`Failed to publish ${packagePath.path}`);
        process.chdir(originalCwd);
        continue;
      }

      console.log(`Successfully published ${packagePath.path}`);
    } catch (error) {
      console.error(`Error publishing ${packagePath.path}:`, error);
      continue;
    } finally {
      // Return to original directory
      process.chdir(originalCwd);
    }
  }

  console.log("All packages published successfully!");
}

async function publishNPMPackages() {
  console.log(Array(20).fill("-").join(""));
  console.log("Starting NPM package publishing...");
  console.log(Array(20).fill("-").join(""));
  const originalCwd = process.cwd();

  for (const packagePath of npmPackagesToPublish) {
    try {
      console.log(Array(20).fill("*").join(""));
      console.log(`> Publishing [${packagePath.path}] ${packagePath.build ? `<${packagePath.build}>` : ''}`);
      if (packagePath.build) {
         const finalPath = path.join(packagePath.path, packagePath.build);
         process.chdir(finalPath);
      } else {
        process.chdir(packagePath.path);
      }

      const { success } = await runCommand("npm", [
        "publish",
        "--access",
        "public",
        "--otp",
        otpCode!,
      ]);

      if (!success) {
        console.error(`Failed to publish ${packagePath.path}`);
      } else {
        console.log(`Successfully published ${packagePath.path}`);
      }
    } catch (error) {
      console.error(`Error publishing ${packagePath.path}:`, error);
    } finally {
      process.chdir(originalCwd);
    }
  }
}

async function showPublishCommands() {
  const version = await fetchLatestVersion();
  console.log(`Version that would be used: ${version}`);
  if (authToken) {
    console.log(`Token that would be used: ${authToken.substring(0, 8)}...`);
  }
  if (otpCode) {
    console.log(`OTP code that would be used: ${otpCode.substring(0, 4)}...`);
  }
  console.log("Publish commands that would be executed:");
  console.log("(Run with --publish flag to actually execute these commands)");
  console.log("");

  for (const packagePath of npmPackagesToPublish) {
    console.log(`cd ${packagePath.path}`);
    const publishCmd = otpCode
      ? `npm publish --access public --otp ${otpCode}`
      : `npm publish --access public`;
    console.log(publishCmd);
    console.log(
      `cd ${
        Array(packagePath.path.split("/").length - 1).fill("..").join("/")
      }/`,
    );
  }

  for (const packagePath of jsrPackagesToPublish) {
    console.log(`cd ${packagePath.path}`);
    const publishCmd = authToken
      ? `deno publish --allow-slow-types --allow-dirty --no-check --token ${authToken}`
      : `deno publish --allow-slow-types --allow-dirty --no-check`;
    console.log(publishCmd);
    console.log(
      `cd ${
        Array(packagePath.path.split("/").length - 1).fill("..").join("/")
      }/`,
    );
    console.log("");
  }
}

async function prePublishPackages() {
  // execute prepublish scripts for all packages
  const originalCwd = process.cwd();
  for (
    const packagePath of [...jsrPackagesToPublish, ...npmPackagesToPublish]
  ) {
    if (packagePath.prepublish) {
      try {
        console.log(`Pre-publishing ${packagePath.path}...`);
        process.chdir(packagePath.path);
        const { success } = await runCommand("deno", packagePath.prepublish);
        if (!success) {
          throw new Error(`Failed to pre-publish ${packagePath.path}`);
        }
        console.log(
          `Successfully pre-published ${packagePath.path} ${
            packagePath.prepublish.join(" ")
          }`,
        );
      } catch (error) {
        console.error(`Error pre-publishing ${packagePath.path}:`, error);
        throw error;
      } finally {
        process.chdir(originalCwd);
      }
    }
  }
}

const runCommand = async (
  command: string,
  commandArgs: string[],
): Promise<{ success: boolean; code: number | null }> => {
  const child = spawn(command, commandArgs, { stdio: "inherit" });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode));
  });
  return { success: code === 0, code };
};

async function main() {
  if (shouldReverse) {
    console.log("Starting reverse replacement...");
    await walkAndProcess(rootDir, true);
  } else {
    console.log("Starting replacement...");

    await walkAndProcess(rootDir, false);

    if (!skipPrepublish) {
      await prePublishPackages();
    }

    if (onlyPrepublish) {
      console.log("Completed pre-publish phase. Exiting due to --only-prepublish.");
      return;
    }
  }

  if (shouldPublish) {
    if (otpCode) {
      await publishNPMPackages();
    }

    await publishJSRPackages();
  } else {
    await showPublishCommands();
  }
  console.log(
    "To revert all changes run `deno -A ./publish-jsr-npm.effectstream.ts --reverse --version 0.3.0`",
  );
  console.log("Complete!");
}

main().catch(console.error);
