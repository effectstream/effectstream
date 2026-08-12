const { spawn } = require("child_process");
const { ensureRuntimeDirectory } = require("@effectstream/binary-runtime");

function runMidnightProofServer(binaryPath, env = process.env, args = []) {
  const workingDirectory = ensureRuntimeDirectory("midnight-proof-server", env);
  console.log(`Starting midnight proof server binary at: ${binaryPath}`);
  const child = spawn(binaryPath, args, { env, stdio: "inherit", cwd: workingDirectory });
  child.on("error", (error) => console.error("Failed to start midnight proof server:", error));
  child.on("exit", (code, signal) => {
    if (code !== null) console.log(`midnight proof server exited with code: ${code}`);
    else console.log(`midnight proof server terminated by signal: ${signal}`);
  });
  return child;
}

module.exports = { runMidnightProofServer };
