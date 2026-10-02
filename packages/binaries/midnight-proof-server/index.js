#!/usr/bin/env node
const { getPlatform, cleanBinaries, binary, checkIfBinaryExists } = require(
  "./binary.js",
);
const { runMidnightProofServer } = require("./run_midnight_proof_server.js");
const { checkIfDockerExists, pullDockerImage, runDockerContainer } = require(
  "./docker.js",
);
const {
  DEFAULT_VERSION,
  DEFAULT_PORT,
  MissingProofServerBinaryError,
  parseFlags,
  resolvePort,
  resolveVersion,
} = require("./config.js");

function isBinarySupported() {
  const supported = require("./package.json").supportedPlatforms;
  return supported.includes(getPlatform());
}

function showUsage() {
  console.log(`\nUsage: npm-midnight-proof-server [options] [args...]\n
Options:
  --docker         Force use of Docker container
  --binary         Force binary execution (macOS arm64 or Linux amd64)
  --port, -p <n>   Host port (default: MIDNIGHT_PROOF_SERVER_PORT or ${DEFAULT_PORT}).
                   In Docker mode a non-default port gets its own container,
                   named midnight-proof-server-<port>.
  --clean-binaries Delete downloaded binaries and download them again
  --only-clean     Only delete downloaded binaries without downloading them again
  --help, -h       Show this help message

Environment:
  MIDNIGHT_PROOF_SERVER_VERSION  Proof server version (default: ${DEFAULT_VERSION}).
                                 Binary mode needs a published effectstream/binaries
                                 asset; Docker mode uses midnightntwrk/proof-server:<version>.
  MIDNIGHT_PROOF_SERVER_PORT     Host port when --port is not given.\n`);
}

async function runWithBinary(env, args, version, forceClean = false) {
  if (forceClean || !checkIfBinaryExists(version)) {
    if (forceClean) {
      console.log("Cleaning downloaded binaries...");
      await cleanBinaries();
    }
    console.log(`Downloading proof server ${version} binary...`);
    await binary(version);
  } else {
    console.log(`Using existing proof server ${version} binary`);
  }
  return runMidnightProofServer(env, args, version);
}

async function runWithDocker(env, args, version, port) {
  if (!(await checkIfDockerExists())) {
    console.error("Docker is required but not installed or not running.");
    process.exit(1);
  }
  await pullDockerImage(version);
  return runDockerContainer(env, args, version, port);
}

(async () => {
  let flags;
  let version;
  let port;
  try {
    flags = parseFlags(process.argv.slice(2));
    version = resolveVersion(process.env);
    port = resolvePort({ flagPort: flags.port, env: process.env });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const env = process.env;
  // The binary reads --port itself; MIDNIGHT_PROOF_SERVER_PORT is inherited.
  const binaryArgs = flags.port !== undefined
    ? [...flags.remaining, "--port", String(port)]
    : flags.remaining;

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
    await runWithDocker(env, flags.remaining, version, port);
    return;
  }

  if (flags.useBinary) {
    if (!isBinarySupported()) {
      console.error(
        `Binary execution not supported on platform ${getPlatform()}`,
      );
      process.exit(1);
    }
    try {
      await runWithBinary(env, binaryArgs, version, flags.cleanBinaries);
    } catch (error) {
      if (error instanceof MissingProofServerBinaryError) {
        console.error(error.message);
        process.exit(1);
      }
      throw error;
    }
    return;
  }

  // Automatic selection
  if (isBinarySupported()) {
    try {
      await runWithBinary(env, binaryArgs, version, flags.cleanBinaries);
    } catch (error) {
      if (!(error instanceof MissingProofServerBinaryError)) throw error;
      console.warn(error.message);
      console.log(`Falling back to Docker for proof server ${version}...`);
      await runWithDocker(env, flags.remaining, version, port);
    }
  } else {
    console.log(
      "Binary not supported on this platform, falling back to Docker...",
    );
    await runWithDocker(env, flags.remaining, version, port);
  }
})();

module.exports = {
  cleanBinaries,
};
