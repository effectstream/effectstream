const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const COMPATIBILITY_FILE_ENV = "EFFECTSTREAM_MIDNIGHT_COMPATIBILITY_FILE";
const evidenceByChild = new WeakMap();

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
 * Loads the one compatibility declaration supplied by the orchestrator. The
 * node package does not own or duplicate the compatibility policy.
 *
 * @param {Object} env
 * @returns {null | {
 *   compatibility: Object,
 *   signal: string,
 *   matched: boolean,
 *   tail: string,
 *   statePath: string,
 * }}
 */
function loadCompatibilityEvidence(env) {
  const compatibilityFile = env[COMPATIBILITY_FILE_ENV];
  if (!compatibilityFile) return null;

  try {
    const compatibility = JSON.parse(
      fs.readFileSync(compatibilityFile, "utf8"),
    );
    const signal = compatibility?.cachedChain?.verifiedIncompatibilitySignal;
    if (
      compatibility?.schemaVersion !== 1 ||
      typeof compatibility?.node?.version !== "string" ||
      typeof compatibility?.node?.ledgerGeneration !== "number" ||
      typeof signal !== "string" ||
      signal.length === 0 ||
      typeof compatibility?.cachedChain?.projectLocalBasePath !== "string"
    ) {
      throw new Error("invalid node/cached-chain compatibility declaration");
    }

    return {
      compatibility,
      signal,
      matched: false,
      tail: "",
      statePath:
        env.BASE_PATH ||
        path.resolve(
          process.cwd(),
          compatibility.cachedChain.projectLocalBasePath,
        ),
    };
  } catch (error) {
    console.error(
      `[midnight-node] compatibility evidence unavailable from ${compatibilityFile}: ${error.message}`,
    );
    return null;
  }
}

function observeCompatibilityEvidence(evidence, chunk) {
  if (!evidence || evidence.matched) return;
  const text = evidence.tail + chunk.toString();
  if (text.includes(evidence.signal)) evidence.matched = true;
  evidence.tail = text.slice(-Math.max(0, evidence.signal.length - 1));
}

function forwardAndObserve(stream, destination, evidence) {
  if (!stream) return;
  stream.on("data", (chunk) => {
    observeCompatibilityEvidence(evidence, chunk);
    destination.write(chunk);
  });
}

function logVerifiedIncompatibility(evidence) {
  const { compatibility, signal, statePath } = evidence;
  console.error(
    `[midnight-node] verified incompatible cached-chain state for node ${compatibility.node.version} / Ledger ${compatibility.node.ledgerGeneration}.`,
  );
  console.error(
    `[midnight-node] Observed the exact verified node error "${signal}".`,
  );
  console.error(
    `[midnight-node] Stop the stack, then archive or remove only ${statePath} if you choose to reset this project-local node state; no data is reset automatically.`,
  );
}

/**
 * Preserves the native node's completion code and emits the strongest
 * evidence-supported classification after all captured output has closed.
 *
 * @param {import("child_process").ChildProcess} childProcess
 * @param {{ evidence?: ReturnType<typeof loadCompatibilityEvidence> }} [options]
 * @returns {Promise<number>}
 */
function waitForNodeCompletion(childProcess, options = {}) {
  const evidence =
    options.evidence === undefined
      ? evidenceByChild.get(childProcess)
      : options.evidence;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      resolve(exitCode);
    };

    childProcess.once("error", (error) => {
      console.error(
        `[midnight-node] child process failed to start: ${error.message}`,
      );
      finish(1);
    });

    childProcess.once("close", (code, signal) => {
      if (code === 0) {
        finish(0);
        return;
      }

      if (typeof code === "number") {
        console.error(
          `[midnight-node] child process exited with nonzero code ${code}; startup cannot continue.`,
        );
        if (evidence?.matched) {
          logVerifiedIncompatibility(evidence);
        } else if (evidence) {
          console.error(
            `[midnight-node] The declaration-owned incompatibility signal was not observed; no incompatible-cache classification was made. Inspect the node log.`,
          );
        }
        finish(code || 1);
        return;
      }

      console.error(
        `[midnight-node] child process terminated by signal ${signal || "unknown"}; startup cannot continue.`,
      );
      finish(1);
    });
  });
}

/**
 * Executes the midnight-node binary as a child process
 * @param {Object} env - Environment variables to pass to the child process
 * @param {Array} args - Optional arguments to pass to the binary
 * @returns {ChildProcess} The spawned child process
 */
function runMidnightNode(env = process.env, args = []) {
  const newEnv = applyDefaultEnv(env);
  const evidence = loadCompatibilityEvidence(newEnv);

  const binaryName = "midnight-node";
  const binaryPath = path.join(__dirname, "midnight-node", binaryName);

  console.log(
    `Starting midnight-node binary at: ${binaryPath} ${args.join(" ")}`,
  );

  const childProcess = spawn(binaryPath, args, {
    env: newEnv,
    stdio: evidence ? ["inherit", "pipe", "pipe"] : "inherit",
    cwd: path.join(__dirname, "midnight-node"), // Run from inside the midnight-node directory
  });

  if (evidence) {
    evidenceByChild.set(childProcess, evidence);
    forwardAndObserve(childProcess.stdout, process.stdout, evidence);
    forwardAndObserve(childProcess.stderr, process.stderr, evidence);
  }

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

module.exports = {
  COMPATIBILITY_FILE_ENV,
  applyDefaultEnv,
  loadCompatibilityEvidence,
  observeCompatibilityEvidence,
  runMidnightNode,
  waitForNodeCompletion,
};
