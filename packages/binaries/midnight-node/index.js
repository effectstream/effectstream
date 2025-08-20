const { binary } = require("./binary");
const { runMidnightNode } = require("./run_midnight_node");
const { getPlatform } = require("./binary");
const fs = require("fs");
const path = require("path");

function checkIfBinaryExists() {
  const platform = getPlatform();
  const parts = platform.split("-");
  const binaryName = (parts[0] === "linux" && parts[1] === "amd64")
    ? `midnight-node-${platform}`
    : "midnight-node";
  return fs.existsSync(path.join(__dirname, "midnight-node", binaryName));
}

async function main(args) {
  if (!checkIfBinaryExists()) {
    await binary();
  }
  runMidnightNode(process.env, args);
}

main(process.argv.slice(2));
