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
 *   --token <token>    Authentication token for JSR publishing
 *   --otp <code>       One-time password for npm publishing (enables npm publishing when used with --publish)
 *   --dir <path>       Directory to process (default: current working directory)
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
 *   # Use authentication token
 *   deno run -A publish-jsr.paimaexample.ts --publish --token your-token-here
 *
 *   # Publish with npm OTP (enables npm publishing)
 *   deno run -A publish-jsr.paimaexample.ts --publish --otp your-otp-code
 *
 *   # Reverse namespace replacement
 *   deno run -A publish-jsr.paimaexample.ts --reverse
 *
 *   # Process specific directory
 *   deno run -A publish-jsr.paimaexample.ts --dir /path/to/directory
 *
 * BEHAVIOR:
 * - By default, replaces @paima/ references with @paimaexample/ in all .ts, .js, and .json files
 * - Auto-increments patch version in deno.json and package.json files (fetches latest from JSR)
 * - Publishes packages in dependency order to ensure proper versioning
 * - Skips node_modules directories
 * - Without --publish flag, shows what commands would be executed
 */

const shouldPublish = Deno.args.includes("--publish");
const shouldReverse = Deno.args.includes("--reverse");
const versionIndex = Deno.args.indexOf("--version");
const manualVersion = versionIndex !== -1 ? Deno.args[versionIndex + 1] : null;
const tokenIndex = Deno.args.indexOf("--token");
const authToken = tokenIndex !== -1 ? Deno.args[tokenIndex + 1] : null;
const otpIndex = Deno.args.indexOf("--otp");
const otpCode = otpIndex !== -1 ? Deno.args[otpIndex + 1] : null;
const dirIndex = Deno.args.indexOf("--dir");
const rootDir = dirIndex !== -1 ? Deno.args[dirIndex + 1] : Deno.cwd();

const filePattern = /\.(ts|js|json|tsx|jsx)$/i;

// Packages to publish in order
const jsrPackagesToPublish = [
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
  "./packages/chains/evm-contracts",
  "./packages/build-tools/explorer",
  "./packages/build-tools/tui",
  "./packages/build-tools/collector",
  "./packages/build-tools/orchestrator",
];
const npmPackagesToPublish = [
  "./packages/chains/evm-contracts",
  "./packages/binaries/avail-light-client",
  "./packages/binaries/avail-node",
  "./packages/binaries/midnight-indexer",
  "./packages/binaries/midnight-node",
  "./packages/binaries/midnight-proof-server",
];

async function fetchLatestVersion(): Promise<string> {
  // If manual version is provided, use it
  if (manualVersion) {
    console.log(`Using manual version: ${manualVersion}`);
    return manualVersion;
  }
  return JSON.parse(await Deno.readTextFile("./deno.json")).version;
}

async function fetchNextVersionFromJSR(): Promise<string> {
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
    await Deno.writeTextFile(filePath, newContent);
    console.log(`Updated: ${filePath}`);
  } else if (didUpdate) {
    // If only version was updated, still log
    console.log(`Version updated: ${filePath}`);
  }
}

const skipDirectories = [
  `${rootDir}/example-project`,
  `${rootDir}/docs/docs`,
  `${rootDir}/.github`,
];
async function walkAndProcess(dir: string, reverse: boolean = false) {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = `${dir}/${entry.name}`;

    if (entry.isDirectory) {
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
      if (entry.name === "publish-jsr-npm.paimaexample.ts") {
        continue;
      }
      await processFile(fullPath, reverse);
    }
  }
}

async function publishJSRPackages() {
  console.log("Starting package publishing...");

  for (const packagePath of jsrPackagesToPublish) {
    try {
      console.log(`Publishing ${packagePath}...`);

      // Change to the package directory
      const originalCwd = Deno.cwd();
      Deno.chdir(packagePath);

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

      const command = new Deno.Command("deno", {
        args: publishArgs,
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

async function publishNPMPackages() {
  console.log("Starting npm package publishing...");
  for (const packagePath of npmPackagesToPublish) {
    console.log(`Publishing ${packagePath}...`);
    const originalCwd = Deno.cwd();
    Deno.chdir(packagePath);
    const command = new Deno.Command("npm", {
      args: ["publish", "--access", "public", "--otp", otpCode!],
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
    console.log(`cd ${packagePath}`);
    const publishCmd = otpCode
      ? `npm publish --access public --otp ${otpCode}`
      : `npm publish --access public`;
    console.log(publishCmd);
    console.log(
      `cd ${Array(packagePath.split("/").length - 1).fill("..").join("/")}/`,
    );
  }

  for (const packagePath of jsrPackagesToPublish) {
    console.log(`cd ${packagePath}`);
    const publishCmd = authToken
      ? `deno publish --allow-slow-types --allow-dirty --no-check --token ${authToken}`
      : `deno publish --allow-slow-types --allow-dirty --no-check`;
    console.log(publishCmd);
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
    if (otpCode) {
      await publishNPMPackages();
    }

    await publishJSRPackages();
  } else {
    await showPublishCommands();
  }
  console.log(
    "To revert all changes run `deno -A ./publish-jsr-npm.paimaexample.ts --reverse --version 0.3.0`",
  );
  console.log("Complete!");
}

main().catch(console.error);
