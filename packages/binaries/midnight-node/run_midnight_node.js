const { spawn } = require("child_process");
const path = require("path");

/**
 * Applies default environment variables for midnight-node if not already set
 * @param {Object} env - Environment variables object
 * @returns {Object} Environment variables with defaults applied
 */
function applyDefaultEnv(env) {
  const newEnv = { ...env };
  if (!("MC__SLOT_DURATION_MILLIS" in newEnv)) {
    newEnv.MC__SLOT_DURATION_MILLIS = "1000";
  }
  if (!("MOCK_REGISTRATIONS_FILE" in newEnv)) {
    newEnv.MOCK_REGISTRATIONS_FILE = path.join(__dirname, "local-mock.json");
  }
  if (!("USE_MAIN_CHAIN_FOLLOWER_MOCK" in newEnv)) {
    newEnv.USE_MAIN_CHAIN_FOLLOWER_MOCK = "true";
  }
  return newEnv;
}

/**
 * Executes the midnight-node binary as a child process
 * @param {Object} env - Environment variables to pass to the child process
 * @param {Array} args - Optional arguments to pass to the binary
 * @returns {ChildProcess} The spawned child process
 */
function runMidnightNode(env = process.env, args = []) {
  const newEnv = applyDefaultEnv(env);

  const binaryName = "midnight-node";
  const binaryPath = path.join(__dirname, "midnight-node", binaryName);

  console.log(
    `Starting midnight-node binary at: ${binaryPath} ${args.join(" ")}`,
  );

  const childProcess = spawn(binaryPath, args, {
    env: newEnv,
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

module.exports = { applyDefaultEnv, runMidnightNode };
