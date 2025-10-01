const { binary, getPlatform } = require("./binary");
const { runMidnightIndexer } = require("./run_midnight_indexer");
const { checkIfDockerExists, pullDockerImage, runDockerContainer } = require(
  "./docker",
);
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const os = require("os");

function checkIfBinaryExists() {
  const platform = getPlatform();
  const parts = platform.split("-");
  const binaryName = `indexer-standalone-${platform}`;
  return fs.existsSync(
    path.join(__dirname, "indexer-standalone", binaryName),
  );
}

/**
 * Checks if the current platform supports binary execution
 * @returns {boolean} True if binary execution is supported
 */
function isBinarySupported() {
  const platform = os.platform();
  const arch = os.arch();

  // Check if the current platform-arch combination is supported
  const supportedPlatforms = require("./package.json").supportedPlatforms;

  let platformString;
  if (platform === "darwin") {
    platformString = arch === "x64" ? "macos-amd64" : `macos-${arch}`;
  } else {
    platformString = arch === "x64"
      ? `${platform}-amd64`
      : `${platform}-${arch}`;
  }

  return supportedPlatforms.includes(platformString);
}

/**
 * Prompts the user to choose between Docker and binary execution
 * @returns {Promise<boolean>} True if user chooses Docker, false for binary
 */
function promptUserForDockerChoice() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      "Docker is available. Would you like to use Docker instead of downloading the binary? (y/n): ",
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      },
    );
  });
}

/**
 * Shows usage information
 */
function showUsage() {
  console.log(`
Usage: node index.js [options] [args...]

Options:
  --docker    Force use of Docker container
  --binary    Force use of binary execution (supports Linux and macOS arm64)
  --help      Show this help message

Environment Variables:
  APP__INFRA__SECRET             Required: Secret key for the application
  LEDGER_NETWORK_ID              Optional: Ledger network ID (default: Undeployed)
  SUBSTRATE_NODE_WS_URL          Optional: Substrate node WebSocket URL
                                 (Docker default: ws://node:9944, Binary default: ws://localhost:9944)
  FEATURES_WALLET_ENABLED        Optional: Enable wallet features (default: true)
  APP__INFRA__PROOF_SERVER__URL  Optional: Proof server URL
                                 (Docker default: http://proof-server:6300, Binary default: http://localhost:6300)
  APP__INFRA__NODE__URL          Optional: Node URL
                                 (Docker default: ws://node:9944, Binary default: ws://localhost:9944)

Note: macOS Intel users will automatically use Docker. macOS arm64 supports both binary and Docker execution.

Examples:
  APP__INFRA__SECRET=mysecret node index.js --docker    # Use Docker
  APP__INFRA__SECRET=mysecret node index.js --binary    # Use binary (if supported)
  APP__INFRA__SECRET=mysecret node index.js             # Interactive mode (or auto-Docker on unsupported platforms)
  node index.js --help                                  # Show this help
`);
}

/**
 * Parses command line arguments to extract flags and remaining args
 * @param {Array} args - Command line arguments
 * @returns {Object} Object containing useDocker, useBinary flags and remaining args
 */
function parseFlags(args) {
  const flags = {
    useDocker: false,
    useBinary: false,
    showHelp: false,
    remainingArgs: [],
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--docker") {
      flags.useDocker = true;
    } else if (args[i] === "--binary") {
      flags.useBinary = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      flags.showHelp = true;
    } else {
      flags.remainingArgs.push(args[i]);
    }
  }

  return flags;
}

async function runWithDocker(env, args) {
  console.log("Using Docker to run midnight indexer...");

  try {
    // Pull the latest image
    await pullDockerImage();

    // Run the container
    return runDockerContainer(env, args);
  } catch (error) {
    console.error("Failed to run with Docker:", error.message);
    console.log("Falling back to binary execution...");
    return runWithBinary(env, args);
  }
}

/**
 * Sets appropriate defaults for binary execution (localhost-based)
 * @param {Object} env - Original environment variables
 * @returns {Object} Environment variables with localhost defaults
 */
function setBinaryDefaults(env) {
  const binaryEnv = { ...env };

  // Set localhost-based defaults for binary execution
  if (!binaryEnv.LEDGER_NETWORK_ID) {
    binaryEnv.LEDGER_NETWORK_ID = "Undeployed";
  }
  if (!binaryEnv.SUBSTRATE_NODE_WS_URL) {
    binaryEnv.SUBSTRATE_NODE_WS_URL = "ws://localhost:9944";
  }
  if (!binaryEnv.FEATURES_WALLET_ENABLED) {
    binaryEnv.FEATURES_WALLET_ENABLED = "true";
  }
  if (!binaryEnv.APP__INFRA__PROOF_SERVER__URL) {
    binaryEnv.APP__INFRA__PROOF_SERVER__URL = "http://localhost:6300";
  }
  if (!binaryEnv.APP__INFRA__NODE__URL) {
    binaryEnv.APP__INFRA__NODE__URL = "ws://localhost:9944";
  }

  return binaryEnv;
}

async function runWithBinary(env, args) {
  console.log("Using binary to run midnight indexer...");

  // Check for required environment variable
  if (!env.APP__INFRA__SECRET) {
    console.error("Error: APP__INFRA__SECRET environment variable is required");
    console.log("Please set APP__INFRA__SECRET=<your_secret> and run again");
    process.exit(1);
  }

  if (!checkIfBinaryExists()) {
    console.log("Binary not found, downloading...");
    await binary();
  }

  // Set appropriate localhost defaults for binary execution
  const binaryEnv = setBinaryDefaults(env);

  return runMidnightIndexer(binaryEnv, args);
}

async function main(args) {
  const flags = parseFlags(args);
  const env = process.env;

  // Show help if requested
  if (flags.showHelp) {
    showUsage();
    process.exit(0);
  }

  // If both flags are provided, show error
  if (flags.useDocker && flags.useBinary) {
    console.error(
      "Error: Cannot use both --docker and --binary flags simultaneously",
    );
    process.exit(1);
  }

  // If --docker flag is explicitly provided
  if (flags.useDocker) {
    const dockerAvailable = await checkIfDockerExists();
    if (!dockerAvailable) {
      console.error("Error: Docker is not installed or not available");
      console.log("Please install Docker or use the --binary flag");
      process.exit(1);
    }

    // Check for required environment variable
    if (!env.APP__INFRA__SECRET) {
      console.error(
        "Error: APP__INFRA__SECRET environment variable is required",
      );
      console.log(
        "Please set APP__INFRA__SECRET=<your_secret> when running with --docker",
      );
      process.exit(1);
    }

    return runWithDocker(env, flags.remainingArgs);
  }

  // If --binary flag is explicitly provided
  if (flags.useBinary) {
    if (!isBinarySupported()) {
      console.error(
        "Error: Binary execution is not supported on this platform for: " +
          os.platform() +
          " " +
          os.arch(),
      );
      console.log(
        "Please use --docker flag instead, or run without flags to use Docker automatically",
      );
      process.exit(1);
    }
    return runWithBinary(env, flags.remainingArgs);
  }

  // No explicit flag provided - determine best execution method
  const dockerAvailable = await checkIfDockerExists();
  const binarySupported = isBinarySupported();

  // If binary is not supported on this platform, try Docker
  if (!binarySupported) {
    if (!dockerAvailable) {
      console.error(
        "Error: Binary execution is not supported on this platform and Docker is not installed or available. For: " +
          os.platform() +
          " " +
          os.arch(),
      );
      console.log(
        "Please install Docker or ensure your platform is supported for binary execution",
      );
      process.exit(1);
    }
    console.log(
      "Binary execution not supported on this platform - using Docker",
    );

    // Check for required environment variable
    if (!env.APP__INFRA__SECRET) {
      console.error(
        "Error: APP__INFRA__SECRET environment variable is required",
      );
      console.log("Please set APP__INFRA__SECRET=<your_secret> and run again");
      process.exit(1);
    }

    return runWithDocker(env, flags.remainingArgs);
  }

  // On supported platforms, prompt user if Docker is available
  if (dockerAvailable) {
    const useDocker = await promptUserForDockerChoice();
    if (useDocker) {
      // Check for required environment variable
      if (!env.APP__INFRA__SECRET) {
        console.error(
          "Error: APP__INFRA__SECRET environment variable is required",
        );
        console.log(
          "Please set APP__INFRA__SECRET=<your_secret> and run again",
        );
        process.exit(1);
      }
      return runWithDocker(env, flags.remainingArgs);
    }
  }

  // Default to binary execution (only on supported platforms)
  return runWithBinary(env, flags.remainingArgs);
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C) gracefully
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  process.exit(0);
});

main(process.argv.slice(2));
