const { binary, cleanBinaries, isBinaryCacheValid } = require("./binary");
const { runMidnightNode } = require("./run_midnight_node");

function checkIfBinaryExists() {
  return isBinaryCacheValid();
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
    process.exit(0);
  }

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

  if (flags.cleanBinaries || !checkIfBinaryExists()) {
    if (flags.cleanBinaries) {
      console.log("Cleaning downloaded binaries...");
      await cleanBinaries();
    }
    await binary();
  }
  runMidnightNode(process.env, flags.remainingArgs);
}

module.exports = {
  cleanBinaries,
};

main(process.argv.slice(2));
