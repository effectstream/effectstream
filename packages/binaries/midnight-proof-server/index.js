#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");

const { binary, getPlatform } = require("./binary.js");
const { runMidnightProofServer } = require("./run_midnight_proof_server.js");
const { checkIfDockerExists, pullDockerImage, runDockerContainer } = require(
  "./docker.js",
);

function checkIfBinaryExists() {
  const platform = getPlatform();
  const binaryName = `midnight-proof-server-${platform}`;
  return fs.existsSync(path.join(__dirname, "proof-server", binaryName));
}

function isBinarySupported() {
  const supported = require("./package.json").supportedPlatforms;
  return supported.includes(getPlatform());
}

function showUsage() {
  console.log(`\nUsage: npm-midnight-proof-server [options] [args...]\n
Options:
  --docker    Force use of Docker container
  --binary    Force binary execution (Linux only)
  --help, -h  Show this help message\n`);
}

function parseFlags(argv) {
  const flags = {
    useDocker: false,
    useBinary: false,
    showHelp: false,
    remaining: [],
  };
  for (const arg of argv) {
    if (arg === "--docker") flags.useDocker = true;
    else if (arg === "--binary") flags.useBinary = true;
    else if (arg === "--help" || arg === "-h") flags.showHelp = true;
    else flags.remaining.push(arg);
  }
  return flags;
}

async function runWithBinary(env, args) {
  if (!checkIfBinaryExists()) {
    console.log("Binary not found, downloading...");
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

  if (flags.useDocker && flags.useBinary) {
    console.error("Cannot use both --docker and --binary flags simultaneously");
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
    await runWithBinary(env, flags.remaining);
    return;
  }

  // Automatic selection
  if (isBinarySupported()) {
    await runWithBinary(env, flags.remaining);
  } else {
    console.log(
      "Binary not supported on this platform, falling back to Docker...",
    );
    await runWithDocker(env, flags.remaining);
  }
})();
