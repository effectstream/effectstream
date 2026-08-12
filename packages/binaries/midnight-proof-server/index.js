#!/usr/bin/env node
const os = require("os");
const {
  cleanBinaries,
  ensureBinary,
  getBinaryPath,
  getPlatform,
  verifyBinary,
} = require("./binary.js");
const { runMidnightProofServer } = require("./run_midnight_proof_server.js");
const { checkIfDockerExists, pullDockerImage, runDockerContainer } = require("./docker.js");
const { isOffline, usesExternalCache } = require("@effectstream/binary-runtime");

function isBinarySupported() {
  return require("./package.json").supportedPlatforms.includes(getPlatform());
}

function showUsage() {
  console.log(`
Usage: npm-midnight-proof-server [options] [args...]

Options:
  --docker         Force use of Docker (disabled by EFFECTSTREAM_OFFLINE)
  --binary         Force native binary execution
  --download-only  Download and verify without starting
  --verify         Verify the cached executable and exit
  --path           Print the resolved executable path and exit
  --clean-binaries Delete package-local binaries and download again
  --only-clean     Only delete package-local binaries
  --help, -h       Show this help message

Environment:
  EFFECTSTREAM_BINARY_CACHE_DIR  Shared versioned binary cache
  EFFECTSTREAM_RUNTIME_DIR       Writable runtime-data root
  EFFECTSTREAM_OFFLINE=1         Never download or use a Docker fallback
`);
}

function parseFlags(argv) {
  const flags = {
    useDocker: false,
    useBinary: false,
    cleanBinaries: false,
    downloadOnly: false,
    onlyClean: false,
    path: false,
    showHelp: false,
    verify: false,
    remaining: [],
  };
  for (const arg of argv) {
    if (arg === "--docker") flags.useDocker = true;
    else if (arg === "--binary") flags.useBinary = true;
    else if (arg === "--clean-binaries") flags.cleanBinaries = true;
    else if (arg === "--download-only") flags.downloadOnly = true;
    else if (arg === "--only-clean") flags.onlyClean = true;
    else if (arg === "--path") flags.path = true;
    else if (arg === "--verify") flags.verify = true;
    else if (arg === "--help" || arg === "-h") flags.showHelp = true;
    else flags.remaining.push(arg);
  }
  return flags;
}

async function runWithBinary(env, args, forceClean = false) {
  if (forceClean) await cleanBinaries(env);
  const resolved = await ensureBinary(env);
  return runMidnightProofServer(resolved, env, args);
}

async function runWithDocker(env, args) {
  if (isOffline(env)) throw new Error("Docker fallback is disabled by EFFECTSTREAM_OFFLINE=1");
  if (!(await checkIfDockerExists())) throw new Error("Docker is required but unavailable");
  await pullDockerImage();
  return runDockerContainer(env, args);
}

async function main(argv, env = process.env) {
  const flags = parseFlags(argv);
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
  if (flags.useDocker) return runWithDocker(env, flags.remaining);
  if (!isBinarySupported()) {
    if (flags.useBinary || isOffline(env) || usesExternalCache(env)) {
      throw new Error(`Native binary is unsupported on ${os.platform()} ${os.arch()}`);
    }
    return runWithDocker(env, flags.remaining);
  }
  if (flags.useBinary || isOffline(env) || usesExternalCache(env)) {
    return runWithBinary(env, flags.remaining, flags.cleanBinaries);
  }
  return runWithBinary(env, flags.remaining, flags.cleanBinaries);
}

module.exports = { cleanBinaries, isBinarySupported, main, parseFlags };

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
