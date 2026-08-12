const { spawn } = require("child_process");
const path = require("path");
const { ensureRuntimeDirectory } = require("@effectstream/binary-runtime");

function applyDefaultEnv(env) {
  const newEnv = { ...env };
  if (!("MC__SLOT_DURATION_MILLIS" in newEnv)) {
    newEnv.MC__SLOT_DURATION_MILLIS = "1000";
  }
  if (!("MOCK_REGISTRATIONS_FILE" in newEnv)) {
    newEnv.MOCK_REGISTRATIONS_FILE = path.join(__dirname, "local-mock.json");
  }
  return newEnv;
}

function runMidnightNode(binaryPath, env = process.env, args = []) {
  const newEnv = applyDefaultEnv(env);
  const workingDirectory = ensureRuntimeDirectory("midnight-node", newEnv);

  console.log(`Starting midnight-node binary at: ${binaryPath} ${args.join(" ")}`);
  console.log(`Midnight node runtime data: ${workingDirectory}`);

  const childProcess = spawn(binaryPath, args, {
    env: newEnv,
    stdio: "inherit",
    cwd: workingDirectory,
  });

  childProcess.on("spawn", () => {
    console.log(`midnight-node process spawned with PID: ${childProcess.pid}`);
  });
  childProcess.on("error", (error) => {
    console.error("Failed to start midnight-node:", error);
  });
  childProcess.on("exit", (code, signal) => {
    if (code !== null) console.log(`midnight-node process exited with code: ${code}`);
    else console.log(`midnight-node process terminated by signal: ${signal}`);
  });
  return childProcess;
}

module.exports = { applyDefaultEnv, runMidnightNode };
