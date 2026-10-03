const { spawn } = require("child_process");

const { DEFAULT_VERSION, binaryDir, binaryPath } = require("./config.js");

/**
 * Executes the midnight-proof-server binary as a child process.
 * @param {Object} env Environment variables to pass to the child process.
 * @param {Array<string>} args Optional CLI arguments to forward to the binary.
 * @param {string} version Cached version to run (`proof-server/<version>/`).
 * @returns {import('child_process').ChildProcess}
 */
function runMidnightProofServer(
  env = process.env,
  args = [],
  version = DEFAULT_VERSION,
) {
  const executable = binaryPath(version);

  console.log(`Starting midnight proof server ${version} binary at: ${executable}`);

  const child = spawn(executable, args, {
    env,
    stdio: "inherit",
    cwd: binaryDir(version),
  });

  child.on("spawn", () => {
    console.log(`midnight-proof-server spawned with PID: ${child.pid}`);
  });

  child.on("error", (error) => {
    console.error("Failed to start midnight proof server:", error);
  });

  child.on("exit", (code, signal) => {
    if (code !== null) {
      console.log(`midnight proof server exited with code: ${code}`);
    } else {
      console.log(`midnight proof server terminated by signal: ${signal}`);
    }
  });

  return child;
}

module.exports = { runMidnightProofServer };
