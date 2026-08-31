const { spawn, exec, execFile } = require("child_process");
const { randomUUID } = require("crypto");
const { promisify } = require("util");
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const IMAGE_NAME = "midnightntwrk/proof-server";
const IMAGE_TAG = "9.0.0-rc.5";

async function checkIfDockerExists() {
  try {
    await execAsync("docker --version");
    return true;
  } catch {
    return false;
  }
}

async function pullDockerImage(tag = IMAGE_TAG) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["pull", `${IMAGE_NAME}:${tag}`], {
      stdio: "inherit",
    });
    child.on(
      "exit",
      (code) => (code === 0
        ? resolve()
        : reject(new Error(`docker pull exited with ${code}`))),
    );
    child.on("error", reject);
  });
}

function defaultRuntime() {
  return {
    spawn,
    execFile: execFileAsync,
    randomUUID,
    signalEmitter: process,
    setExitCode(code) {
      process.exitCode = code;
    },
  };
}

/**
 * Creates one proof-server container owned by this wrapper run. The immutable
 * container ID is the only identity used for start, stop, and removal.
 *
 * @param {Object} env Env vars to set inside the container.
 * @param {Array<string>} args CLI args.
 * @param {string} tag Docker tag.
 * @param {Object} runtime Injectable command/signal boundary for tests.
 */
async function runDockerContainer(
  env = process.env,
  args = [],
  tag = IMAGE_TAG,
  runtime = defaultRuntime(),
) {
  const runId = runtime.randomUUID();
  const containerName = `midnight-proof-server-${runId}`;
  const hostPort = env.MIDNIGHT_PROOF_SERVER_HOST_PORT || "6300";
  const dockerArgs = [
    "create",
    "--name",
    containerName,
    "--label",
    "effectstream.owner=midnight-proof-server",
    "--label",
    `effectstream.run-id=${runId}`,
    "-p",
    `${hostPort}:6300`,
  ];

  // Preserve the wrapper's existing environment-forwarding behavior, except
  // for the host-only published-port selector.
  Object.entries(env).forEach(([key, value]) => {
    if (value && key !== "MIDNIGHT_PROOF_SERVER_HOST_PORT") {
      dockerArgs.push("-e", `${key}=${value}`);
    }
  });

  dockerArgs.push(`${IMAGE_NAME}:${tag}`);
  if (args.length > 0) dockerArgs.push(...args);

  console.log(`Creating owned proof-server container: ${containerName}`);
  const created = await runtime.execFile("docker", dockerArgs);
  const containerId = created.stdout.trim();
  if (!/^[a-f0-9]{64}$/.test(containerId)) {
    // docker create succeeded under our unique name, but did not return the
    // immutable identity contract we require. Remove only that just-created
    // unique name and refuse to start or attach anything.
    await runtime.execFile("docker", ["rm", containerName]).catch(() => {});
    throw new Error(
      `docker create returned an invalid immutable container ID: ${containerId || "<empty>"}`,
    );
  }

  try {
    const inspected = await runtime.execFile(
      "docker",
      ["inspect", "--format={{.Id}}", containerId],
    );
    if (inspected.stdout.trim() !== containerId) {
      throw new Error("created proof-server container identity changed during validation");
    }
  } catch (error) {
    await runtime.execFile("docker", ["rm", containerId]).catch(() => {});
    throw error;
  }

  console.log(`Starting owned proof-server container: ${containerId}`);
  let child;
  try {
    child = runtime.spawn("docker", ["start", "-a", containerId], {
      stdio: "inherit",
    });
  } catch (error) {
    await runtime.execFile("docker", ["rm", containerId]).catch(() => {});
    throw error;
  }

  let cleanupPromise;
  const signalHandlers = new Map();
  const removeSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      runtime.signalEmitter.removeListener(signal, handler);
    }
    signalHandlers.clear();
  };
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      // An attached docker CLI exiting does not prove the container stopped.
      // Every cleanup trigger therefore converges on the same conservative,
      // idempotent stop-before-remove sequence for the immutable owned ID.
      // Keep the stop timeout below the orchestrator's five-second group grace
      // window so the wrapper can finish ID-based cleanup before escalation.
      await runtime
        .execFile("docker", ["stop", "--timeout", "3", containerId])
        .catch((error) => {
          console.warn(
            `Could not stop owned proof-server container ${containerId}: ${error.message}`,
          );
        });
      await runtime.execFile("docker", ["rm", containerId]);
    })().finally(removeSignalHandlers);
    return cleanupPromise;
  };

  for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const handler = () => {
      cleanup()
        .catch((error) => {
          console.error(
            `Failed to clean up owned proof-server container ${containerId}:`,
            error,
          );
        })
        .finally(() => runtime.setExitCode?.(exitCode));
    };
    signalHandlers.set(signal, handler);
    runtime.signalEmitter.once(signal, handler);
  }

  child.once("exit", () => {
    cleanup().catch((error) => {
      console.error(`Failed to remove owned proof-server container ${containerId}:`, error);
    });
  });
  child.once("error", () => {
    cleanup().catch((error) => {
      console.error(`Failed to clean up owned proof-server container ${containerId}:`, error);
    });
  });

  Object.defineProperty(child, "ownedContainerId", { value: containerId });
  Object.defineProperty(child, "cleanup", {
    get() {
      return cleanupPromise ?? Promise.resolve();
    },
  });
  return child;
}

module.exports = { checkIfDockerExists, pullDockerImage, runDockerContainer };
