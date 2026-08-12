#!/usr/bin/env node
const readline = require("readline");
const os = require("os");
const {
  cleanBinaries,
  ensureBinary,
  getBinaryPath,
  getPlatform,
  verifyBinary,
} = require("./binary");
const { runMidnightIndexer, waitForNodeBlock } = require("./run_midnight_indexer");
const { checkIfDockerExists, pullDockerImage, runDockerContainer } = require("./docker");
const { isOffline, usesExternalCache } = require("@effectstream/binary-runtime");

function isBinarySupported() {
  return require("./package.json").supportedPlatforms.includes(getPlatform());
}

function promptUserForDockerChoice() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Docker is available. Use Docker instead of the native binary? (y/n): ", (answer) => {
      rl.close();
      resolve(["y", "yes"].includes(answer.toLowerCase()));
    });
  });
}

function showUsage() {
  console.log(`
Usage: npm-midnight-indexer [options] [args...]

Options:
  --docker         Force use of Docker (disabled by EFFECTSTREAM_OFFLINE)
  --binary         Force native binary execution
  --download-only  Download and verify without starting
  --verify         Verify the cached executable and exit
  --path           Print the resolved executable path and exit
  --clean-binaries Delete package-local binaries and download again
  --only-clean     Only delete package-local binaries
  --clean          Delete writable SQLite state before starting
  --help, -h       Show this help message

Environment:
  EFFECTSTREAM_BINARY_CACHE_DIR  Shared versioned binary cache
  EFFECTSTREAM_RUNTIME_DIR       Writable runtime-data root
  EFFECTSTREAM_OFFLINE=1         Never download or use a Docker fallback
`);
}

function parseFlags(args) {
  const flags = {
    useDocker: false,
    useBinary: false,
    cleanBinaries: false,
    downloadOnly: false,
    onlyClean: false,
    path: false,
    showHelp: false,
    verify: false,
    remainingArgs: [],
  };
  for (const arg of args) {
    if (arg === "--docker") flags.useDocker = true;
    else if (arg === "--binary") flags.useBinary = true;
    else if (arg === "--clean-binaries") flags.cleanBinaries = true;
    else if (arg === "--download-only") flags.downloadOnly = true;
    else if (arg === "--only-clean") flags.onlyClean = true;
    else if (arg === "--path") flags.path = true;
    else if (arg === "--verify") flags.verify = true;
    else if (arg === "--help" || arg === "-h") flags.showHelp = true;
    else flags.remainingArgs.push(arg);
  }
  return flags;
}

function setBinaryDefaults(env) {
  return {
    ...env,
    LEDGER_NETWORK_ID: env.LEDGER_NETWORK_ID || "Undeployed",
    SUBSTRATE_NODE_WS_URL: env.SUBSTRATE_NODE_WS_URL || "ws://localhost:9944",
    FEATURES_WALLET_ENABLED: env.FEATURES_WALLET_ENABLED || "true",
    APP__INFRA__PROOF_SERVER__URL:
      env.APP__INFRA__PROOF_SERVER__URL || "http://localhost:6300",
    APP__INFRA__NODE__URL: env.APP__INFRA__NODE__URL || "ws://localhost:9944",
  };
}

async function runWithBinary(env, args, forceClean = false) {
  if (!env.APP__INFRA__SECRET) {
    throw new Error("APP__INFRA__SECRET environment variable is required");
  }
  if (forceClean) await cleanBinaries(env);
  const resolved = await ensureBinary(env);
  const binaryEnv = setBinaryDefaults(env);
  await waitForNodeBlock(binaryEnv);
  return runMidnightIndexer(resolved, binaryEnv, args);
}

async function runWithDocker(env, args) {
  if (isOffline(env)) throw new Error("Docker fallback is disabled by EFFECTSTREAM_OFFLINE=1");
  if (!(await checkIfDockerExists())) throw new Error("Docker is not installed or available");
  if (!env.APP__INFRA__SECRET) throw new Error("APP__INFRA__SECRET is required");
  await pullDockerImage();
  return runDockerContainer(env, args);
}

async function main(args, env = process.env) {
  const flags = parseFlags(args);
  if (flags.showHelp) return showUsage();
  if (flags.useDocker && flags.useBinary) throw new Error("Cannot use both --docker and --binary");
  if (flags.path) {
    console.log(getBinaryPath(env));
    return;
  }
  if (flags.onlyClean) {
    const deleted = await cleanBinaries(env);
    console.log(deleted.length ? `Deleted: ${deleted.join(", ")}` : "No downloaded binaries found.");
    return;
  }
  if (flags.downloadOnly || flags.verify) {
    if (flags.cleanBinaries) await cleanBinaries(env);
    const resolved = flags.verify ? verifyBinary(env) : await ensureBinary(env);
    console.log(`${flags.verify ? "Verified" : "Ready"}: ${resolved}`);
    return;
  }
  if (flags.useDocker) return runWithDocker(env, flags.remainingArgs);
  if (!isBinarySupported()) {
    if (flags.useBinary || isOffline(env) || usesExternalCache(env)) {
      throw new Error(`Native binary is unsupported on ${os.platform()} ${os.arch()}`);
    }
    return runWithDocker(env, flags.remainingArgs);
  }
  if (flags.useBinary || isOffline(env) || usesExternalCache(env)) {
    return runWithBinary(env, flags.remainingArgs, flags.cleanBinaries);
  }
  if (await checkIfDockerExists()) {
    if (await promptUserForDockerChoice()) return runWithDocker(env, flags.remainingArgs);
  }
  return runWithBinary(env, flags.remainingArgs, flags.cleanBinaries);
}

module.exports = {
  cleanBinaries,
  isBinarySupported,
  main,
  parseFlags,
  setBinaryDefaults,
};

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
