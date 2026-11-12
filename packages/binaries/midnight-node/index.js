const { binary, cleanBinaries } = require("./binary");
const {
  runMidnightNode,
  waitForNodeCompletion,
} = require("./run_midnight_node");
const fs = require("fs");
const path = require("path");

const FINAL_BINARY_NAME = "midnight-node";

function checkIfBinaryExists() {
  return fs.existsSync(
    path.join(__dirname, "midnight-node", FINAL_BINARY_NAME),
  );
}

function showUsage() {
  console.log(`
Usage: node index.js [options] [args...]

Options:
  --clean-binaries Delete downloaded binaries and download them again
  --only-clean     Only delete downloaded binaries without downloading them again
  --help, -h       Show this help message
`);
}

function parseFlags(args) {
  const flags = {
    cleanBinaries: false,
    onlyClean: false,
    showHelp: false,
    remainingArgs: [],
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--clean-binaries") {
      flags.cleanBinaries = true;
    } else if (args[i] === "--only-clean") {
      flags.onlyClean = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      flags.showHelp = true;
    } else {
      flags.remainingArgs.push(args[i]);
    }
  }

  return flags;
}

async function main(args) {
  const flags = parseFlags(args);

  if (flags.showHelp) {
    showUsage();
    return 0;
  }

  if (flags.onlyClean) {
    console.log("Cleaning downloaded binaries...");
    const deletedFiles = await cleanBinaries();
    if (deletedFiles.length > 0) {
      console.log("Deleted:", deletedFiles.join(", "));
    } else {
      console.log("No downloaded binaries found to delete.");
    }
    return 0;
  }

  if (flags.cleanBinaries || !checkIfBinaryExists()) {
    if (flags.cleanBinaries) {
      console.log("Cleaning downloaded binaries...");
      await cleanBinaries();
    }
    await binary();
  }
  const childProcess = runMidnightNode(process.env, flags.remainingArgs);
  return waitForNodeCompletion(childProcess);
}

module.exports = {
  cleanBinaries,
  main,
};

if (require.main === module) {
  main(process.argv.slice(2))
    .then((exitCode) => {
      if (typeof exitCode === "number") process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error("midnight-node startup failed:", error);
      process.exitCode = 1;
    });
}
