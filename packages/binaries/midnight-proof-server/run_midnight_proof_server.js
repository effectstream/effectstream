const { spawn } = require("child_process");
const path = require("path");

/**
 * Executes the midnight-proof-server binary as a child process.
 * @param {Object} env Environment variables to pass to the child process.
 * @param {Array<string>} args Optional CLI arguments to forward to the binary.
 * @returns {import('child_process').ChildProcess}
 */
function runMidnightProofServer(env = process.env, args = []) {
  const binaryPath = path.join(__dirname, "proof-server", "proof-server");

  console.log(`Starting midnight proof server binary at: ${binaryPath}`);

  const child = spawn(binaryPath, args, {
    env,
    stdio: "inherit",
    cwd: path.join(__dirname, "proof-server"),
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
