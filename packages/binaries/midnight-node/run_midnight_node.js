const { spawn } = require("child_process");
const path = require("path");

/**
 * Executes the midnight-node binary as a child process
 * @param {Object} env - Environment variables to pass to the child process
 * @param {Array} args - Optional arguments to pass to the binary
 * @returns {ChildProcess} The spawned child process
 */
function runMidnightNode(env = process.env, args = []) {
  const binaryPath = path.join(__dirname, "midnight-node", "midnight-node");

  console.log(`Starting midnight-node binary at: ${binaryPath}`);

  const childProcess = spawn(binaryPath, args, {
    env: env,
    stdio: "inherit", // Inherit stdin, stdout, stderr from parent process
    cwd: path.join(__dirname, "midnight-node"), // Run from inside the midnight-node directory
  });

  childProcess.on("spawn", () => {
    console.log(`midnight-node process spawned with PID: ${childProcess.pid}`);
  });

  childProcess.on("error", (error) => {
    console.error("Failed to start midnight-node:", error);
  });

  childProcess.on("exit", (code, signal) => {
    if (code !== null) {
      console.log(`midnight-node process exited with code: ${code}`);
    } else {
      console.log(`midnight-node process terminated by signal: ${signal}`);
    }
  });

  return childProcess;
}

module.exports = { runMidnightNode };
