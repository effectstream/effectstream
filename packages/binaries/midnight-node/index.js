#!/usr/bin/env node
const { cleanBinaries, ensureBinary, getBinaryPath, verifyBinary } = require("./binary");
const { runMidnightNode } = require("./run_midnight_node");

function showUsage() {
  console.log(`
Usage: npm-midnight-node [options] [args...]

Options:
  --download-only  Download and verify the binary without starting it
  --verify         Verify the cached executable and exit
  --path           Print the resolved executable path and exit
  --clean-binaries Delete package-local binaries and download them again
  --only-clean     Only delete package-local binaries
  --help, -h       Show this help message

Environment:
  EFFECTSTREAM_BINARY_CACHE_DIR  Shared versioned binary cache
  EFFECTSTREAM_RUNTIME_DIR       Writable runtime-data root
  EFFECTSTREAM_OFFLINE=1         Never download or use a Docker fallback
`);
}

function parseFlags(args) {
  const flags = {
    cleanBinaries: false,
    downloadOnly: false,
    onlyClean: false,
    path: false,
    showHelp: false,
    verify: false,
    remainingArgs: [],
  };
  for (const arg of args) {
    if (arg === "--clean-binaries") flags.cleanBinaries = true;
    else if (arg === "--download-only") flags.downloadOnly = true;
    else if (arg === "--only-clean") flags.onlyClean = true;
    else if (arg === "--path") flags.path = true;
    else if (arg === "--verify") flags.verify = true;
    else if (arg === "--help" || arg === "-h") flags.showHelp = true;
    else flags.remainingArgs.push(arg);
  }
  return flags;
}

async function main(args, env = process.env) {
  const flags = parseFlags(args);
  if (flags.showHelp) return showUsage();
  if (flags.path) {
    console.log(getBinaryPath(env));
    return;
  }
  if (flags.onlyClean) {
    const deleted = await cleanBinaries(env);
    console.log(deleted.length ? `Deleted: ${deleted.join(", ")}` : "No downloaded binaries found.");
    return;
  }
  if (flags.cleanBinaries) await cleanBinaries(env);
  const resolved = await ensureBinary(env);
  if (flags.verify) {
    verifyBinary(env);
    console.log(`Verified: ${resolved}`);
    return;
  }
  if (flags.downloadOnly) {
    console.log(`Ready: ${resolved}`);
    return;
  }
  return runMidnightNode(resolved, env, flags.remainingArgs);
}

module.exports = { cleanBinaries, main, parseFlags };

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
