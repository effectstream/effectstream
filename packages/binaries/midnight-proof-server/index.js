#!/usr/bin/env node
const os = require("os");

const {
  binary,
  getPlatform,
  cleanBinaries,
  isBinaryCacheValid,
} = require("./binary.js");
const { runMidnightProofServer } = require("./run_midnight_proof_server.js");
const { checkIfDockerExists, pullDockerImage, runDockerContainer } = require(
  "./docker.js",
);

function checkIfBinaryExists() {
  return isBinaryCacheValid();
}

function isBinarySupported() {
  const supported = require("./package.json").supportedPlatforms;
  return supported.includes(getPlatform());
}

function showUsage() {
  console.log(`\nUsage: npm-midnight-proof-server [options] [args...]\n
Options:
  --docker         Force use of Docker container
  --binary         Force binary execution (macOS arm64 or Linux amd64)
  --clean-binaries Delete downloaded binaries and download them again
  --only-clean     Only delete downloaded binaries without downloading them again
  --help, -h       Show this help message\n`);
}

function parseFlags(argv) {
  const flags = {
    useDocker: false,
    useBinary: false,
    cleanBinaries: false,
    onlyClean: false,
    showHelp: false,
    remaining: [],
  };
  for (const arg of argv) {
    if (arg === "--docker") flags.useDocker = true;
    else if (arg === "--binary") flags.useBinary = true;
    else if (arg === "--clean-binaries") flags.cleanBinaries = true;
    else if (arg === "--only-clean") flags.onlyClean = true;
    else if (arg === "--help" || arg === "-h") flags.showHelp = true;
    else flags.remaining.push(arg);
  }
  return flags;
}

async function runWithBinary(env, args, forceClean = false) {
  if (forceClean || !checkIfBinaryExists()) {
    if (forceClean) {
      console.log("Cleaning downloaded binaries...");
      await cleanBinaries();
    }
    console.log("Downloading binary...");
    await binary();
  } else {
    console.log("Using existing binary found in proof-server directory");
  }
  return runMidnightProofServer(env, args);
}

async function runWithDocker(env, args) {
  if (!(await checkIfDockerExists())) {
    console.error("Docker is required but not installed or not running.");
    process.exit(1);
  }
  await pullDockerImage();
  return runDockerContainer(env, args);
}

(async () => {
  const flags = parseFlags(process.argv.slice(2));
  const env = process.env;

  if (flags.showHelp) {
    showUsage();
    process.exit(0);
  }

  // Handle --only-clean flag
  if (flags.onlyClean) {
    console.log("Cleaning downloaded binaries...");
    const deletedFiles = await cleanBinaries();
    if (deletedFiles.length > 0) {
      console.log("Deleted:", deletedFiles.join(", "));
    } else {
      console.log("No downloaded binaries found to delete.");
    }
    process.exit(0);
  }

  if (flags.useDocker && flags.useBinary) {
    console.error("Cannot use both --docker and --binary flags simultaneously");
    process.exit(1);
  }

  // Validate clean flag usage
  if (flags.cleanBinaries && flags.useDocker) {
    console.error(
      "Error: --clean-binaries flag cannot be used with --docker flag",
    );
    process.exit(1);
  }

  if (flags.useDocker) {
    await runWithDocker(env, flags.remaining);
    return;
  }

  if (flags.useBinary) {
    if (!isBinarySupported()) {
      console.error(
        `Binary execution not supported on platform ${getPlatform()}`,
      );
      process.exit(1);
    }
    await runWithBinary(env, flags.remaining, flags.cleanBinaries);
    return;
  }

  // Automatic selection
  if (isBinarySupported()) {
    await runWithBinary(env, flags.remaining, flags.cleanBinaries);
  } else {
    console.log(
      "Binary not supported on this platform, falling back to Docker...",
    );
    await runWithDocker(env, flags.remaining);
  }
})();

module.exports = {
  cleanBinaries,
};
