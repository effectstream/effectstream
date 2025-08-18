const { binary } = require("./binary");
const { runMidnightNode } = require("./run_midnight_node");
const fs = require("fs");
const path = require("path");

function checkIfBinaryExists() {
  return fs.existsSync(path.join(__dirname, "midnight-node", "midnight-node"));
}


async function main(args) {
  if (!checkIfBinaryExists()) {
    await binary();
  }
  runMidnightNode(process.env, args);
}

main(process.argv.slice(2));
