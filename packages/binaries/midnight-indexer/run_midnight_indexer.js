const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const axios = require("axios");
const compatibility = require("./compatibility.json");

const BINARY_NAME = "indexer-standalone";

function logCompatibilityGuidance(prefix = "midnight-indexer") {
  const localState = compatibility.cachedChain.projectLocalBasePath;
  console.error(
    `[${prefix}] unknown startup/readiness failure for node ${compatibility.node.version} / Ledger ${compatibility.node.ledgerGeneration} and indexer ${compatibility.indexer.version}.`,
  );
  console.error(
    `[${prefix}] Inspect the node and indexer logs. Only the exact verified node error "${compatibility.cachedChain.verifiedIncompatibilitySignal}" proves an incompatible Ledger-8 cache; otherwise treat stale state as only one possibility.`,
  );
  console.error(
    `[${prefix}] Indexer --clean removes only indexer SQLite data. After stopping the stack, archive or remove only the project-local node state at ${localState} if you choose to reset it; no automatic reset is performed.`,
  );
}

/**
 * Waits for a spawned service process and converts every completion mode to a
 * CLI-compatible exit code. The launcher itself remains synchronous and keeps
 * returning the ChildProcess for existing API consumers.
 *
 * @param {import("child_process").ChildProcess} childProcess
 * @param {{ serviceName?: string }} [options]
 * @returns {Promise<number>}
 */
function waitForChildCompletion(childProcess, options = {}) {
  const serviceName = options.serviceName || "midnight-indexer";

  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      resolve(exitCode);
    };

    childProcess.once("error", (error) => {
      console.error(
        `[${serviceName}] child process failed to start: ${error.message}`,
      );
      finish(1);
    });

    childProcess.once("exit", (code, signal) => {
      if (code === 0) {
        finish(0);
        return;
      }

      if (typeof code === "number") {
        console.error(
          `[${serviceName}] child process exited with nonzero code ${code}; startup cannot continue.`,
        );
        logCompatibilityGuidance(serviceName);
        finish(code || 1);
        return;
      }

      console.error(
        `[${serviceName}] child process terminated by signal ${signal || "unknown"}; startup cannot continue.`,
      );
      logCompatibilityGuidance(serviceName);
      finish(1);
    });
  });
}

function isValidIndexerSecret(secret) {
  return typeof secret === "string" && /^[0-9a-fA-F]{64}$/.test(secret);
}

/**
 * Waits until the Midnight node has produced at least `minBlock`.
 *
 * The v4.4.0-rc.1 indexer bundles an spo-indexer that, on a fresh DB, reads block #1
 * to anchor the first epoch and exits(1) — killing the whole indexer — if that
 * block does not exist yet. Gating startup on block #1 avoids that startup race.
 *
 * @param {Object} env - Environment variables (used to resolve the node URL)
 * @param {Object} [opts]
 * @param {number} [opts.minBlock=1] - Block number that must exist
 * @param {number} [opts.timeoutMs=55000] - Give up before the outer 60s readiness bound
 * @param {number} [opts.intervalMs=1000] - Poll interval
 * @returns {Promise<boolean>} Whether block readiness was observed
 */
async function waitForNodeBlock(env, opts = {}) {
  const { minBlock = 1, timeoutMs = 55000, intervalMs = 1000 } = opts;
  const wsUrl =
    env.SUBSTRATE_NODE_WS_URL ||
    env.APP__INFRA__NODE__URL ||
    "ws://localhost:9944";
  const httpUrl = wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");

  const deadline = Date.now() + timeoutMs;
  console.log(
    `Waiting for node ${compatibility.node.version} / Ledger ${compatibility.node.ledgerGeneration} to produce block #${minBlock} at ${httpUrl} (indexer ${compatibility.indexer.version} startup guard)...`,
  );
  while (Date.now() < deadline) {
    try {
      const { data } = await axios.post(
        httpUrl,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "chain_getBlockHash",
          params: [minBlock],
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: Math.min(5000, Math.max(1, deadline - Date.now())),
        },
      );
      if (data && data.result) {
        console.log(
          `Node has block #${minBlock} (${data.result}); starting indexer.`,
        );
        return true;
      }
    } catch {
      // node not reachable yet; keep polling
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.error(
    `[midnight-indexer] missing block-one readiness: node ${compatibility.node.version} / Ledger ${compatibility.node.ledgerGeneration} did not produce block #${minBlock} within ${timeoutMs}ms; indexer startup is stopping.`,
  );
  logCompatibilityGuidance("midnight-indexer");
  return false;
}

/**
 * Resolves the configuration file path
 * @param {Object} env - Environment variables
 * @param {string} workingDir - The working directory where the indexer runs
 * @returns {string} The resolved configuration file path
 */
function resolveConfigPath(env, workingDir) {
  if (env.CONFIG_FILE) {
    return path.isAbsolute(env.CONFIG_FILE)
      ? env.CONFIG_FILE
      : path.resolve(workingDir, env.CONFIG_FILE);
  }
  // Fall back to config.yaml in the current working directory
  return path.join(workingDir, "config.yaml");
}

/**
 * Ensures that a configuration file exists at the given path
 * @param {string} configPath - The path to the configuration file
 * @param {Object} env - Environment variables
 */
function ensureConfigExists(configPath, env) {
  if (fs.existsSync(configPath)) {
    return;
  }

  console.log(
    `Config file not found. Generating default config at: ${configPath}`,
  );

  const networkId = env.LEDGER_NETWORK_ID || "Undeployed";
  const nodeUrl =
    env.SUBSTRATE_NODE_WS_URL ||
    env.APP__INFRA__NODE__URL ||
    "ws://localhost:9944";
  const cnnUrl = env.APP__INFRA__STORAGE__CNN_URL || "./data/indexer.sqlite";
  const apiPort = env.APP__INFRA__API__PORT || 8088;

  const defaultConfig = `
thread_stack_size: "24MiB"

application:
  network_id: "${networkId.toLowerCase()}"
  blocks_buffer: 10
  caught_up_max_distance: 10
  caught_up_leeway: 5
  gc_bound: "200ms"
  ledger_state_retention: 1000
  active_wallets_query_delay: "500ms"
  active_wallets_ttl: "30m"
  transaction_batch_size: 50

spo:
  interval: 5000
  stake_refresh:
    period_secs: 900
    page_size: 100
    max_rps: 2

infra:
  run_migrations: true
  storage:
    cnn_url: "${cnnUrl}"
  ledger_db:
    cache_size: "1kiB"
    cnn_url: "${env.APP__INFRA__LEDGER_DB__CNN_URL || "./data/ledger-db.sqlite"}"
  node:
    url: "${nodeUrl}"
    reconnect_max_delay: "10s"
    reconnect_max_attempts: 30
    subscription_recovery_timeout: "30s"
  spo_node:
    url: "${env.APP__INFRA__SPO_NODE__URL || nodeUrl}"
    reconnect_max_delay: "10s"
    reconnect_max_attempts: 30
    blockfrost_id: "${env.APP__INFRA__SPO_NODE__BLOCKFROST_ID || "dummy-not-using-spo"}"
  api:
    address: "${env.APP__INFRA__API__ADDRESS || "0.0.0.0"}"
    port: ${apiPort}
    request_body_limit: "1MiB"
    max_complexity: 200
    max_depth: 15
    subscription:
      blocks: { batch_size: 20 }
      contract_actions: { batch_size: 20 }
      contract_events: { batch_size: 20 }
      dust_generations: { batch_size: 20 }
      dust_ledger_events: { batch_size: 20 }
      dust_nullifier_transactions: { batch_size: 20 }
      shielded_nullifier_transactions: { batch_size: 20 }
      shielded_transactions:
        batch_size: 20
        progress_update_interval: "30s"
        keep_wallet_alive_interval: "1m"
      unshielded_transactions:
        batch_size: 20
        progress_update_interval: "30s"
      zswap_ledger_events: { batch_size: 20 }
      progress_cache:
        max_capacity: 10000
        time_to_live: "5s"
    quota:
      max_concurrent_per_connection: 20
      max_session_subscriptions_per_minute: 10

telemetry:
  tracing:
    enabled: false
    service_name: "indexer"
    otlp_exporter_endpoint: "http://localhost:4317"
  metrics:
    enabled: false
    address: "0.0.0.0"
    port: ${env.APP__TELEMETRY__METRICS__PORT || 9000}
`;

  fs.writeFileSync(configPath, defaultConfig.trim());
}

/**
 * Resolves the SQLite database path using the midnight-indexer configuration rules
 * @param {Object} env - Environment variables
 * @param {string} workingDir - The working directory where the indexer runs
 * @returns {string|null} The resolved SQLite database path, or null if not found
 */
function resolveSqlitePath(env, workingDir) {
  // First check the APP__INFRA__STORAGE__CNN_URL environment variable
  const envCnnUrl = env.APP__INFRA__STORAGE__CNN_URL;
  if (envCnnUrl) {
    console.log(`Found SQLite path from environment variable: ${envCnnUrl}`);
    return envCnnUrl;
  }

  const configPath = resolveConfigPath(env, workingDir);
  console.log(`Looking for config file at: ${configPath}`);

  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    console.warn(`Config file not found at: ${configPath}`);
    return null;
  }

  try {
    // Parse the YAML config file
    const configContent = fs.readFileSync(configPath, "utf8");
    const config = yaml.load(configContent);

    // Extract the cnn_url from infra.storage
    const cnnUrl = config?.infra?.storage?.cnn_url;
    if (!cnnUrl) {
      console.warn("No cnn_url found in config file under infra.storage");
      return null;
    }

    console.log(`Found SQLite path from config file: ${cnnUrl}`);

    // If the path is relative, resolve it against the binary working directory (indexer-standalone)
    if (!path.isAbsolute(cnnUrl)) {
      const resolvedPath = path.resolve(workingDir, cnnUrl);
      console.log(`Resolved relative path to: ${resolvedPath}`);
      return resolvedPath;
    }

    return cnnUrl;
  } catch (error) {
    console.error(`Failed to parse config file: ${error.message}`);
    return null;
  }
}

/**
 * Resolves the SQLite database path with a fallback to the default location
 * @param {Object} env - Environment variables
 * @param {string} workingDir - The working directory where the indexer runs
 * @returns {string} The resolved SQLite database path
 */
function resolveSqlitePathWithFallback(env, workingDir) {
  const sqlitePath = resolveSqlitePath(env, workingDir);
  if (sqlitePath) {
    return sqlitePath;
  }

  // Fallback to default indexer location: data/indexer.sqlite
  const defaultPath = path.join(workingDir, "data", "indexer.sqlite");
  console.log(`Using default SQLite path: ${defaultPath}`);
  return defaultPath;
}

/**
 * Handles the --clean flag by deleting the SQLite database file
 * @param {Object} env - Environment variables
 * @param {string} workingDir - The working directory where the indexer runs
 */
function handleCleanFlag(env, workingDir) {
  console.log("Processing --clean flag...");

  const sqlitePath = resolveSqlitePathWithFallback(env, workingDir);

  // Handle sqlite:// URLs and extract the file path
  let filePath = sqlitePath;
  if (sqlitePath.startsWith("sqlite://")) {
    filePath = sqlitePath.replace("sqlite://", "");
  } else if (sqlitePath.startsWith("sqlite:///")) {
    filePath = sqlitePath.replace("sqlite:///", "/");
  }

  console.log(`Attempting to clean SQLite database at: ${filePath}`);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Successfully deleted SQLite database: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete SQLite database: ${error.message}`);
    }
  } else {
    console.log(
      `SQLite database does not exist (will be created fresh): ${filePath}`,
    );
  }
}

/**
 * Executes the midnight-indexer binary as a child process
 * @param {Object} env - Environment variables to pass to the child process
 * @param {Array} args - Optional arguments to pass to the binary
 * @returns {ChildProcess} The spawned child process
 */
function runMidnightIndexer(env = process.env, args = []) {
  const binaryPath = path.join(__dirname, "indexer-standalone", BINARY_NAME);
  const workingDir = path.join(__dirname, "indexer-standalone");

  const configPath = resolveConfigPath(env, workingDir);
  ensureConfigExists(configPath, env);

  // Check for --clean flag and handle it
  const cleanFlagIndex = args.indexOf("--clean");
  if (cleanFlagIndex !== -1) {
    handleCleanFlag(env, workingDir);
    // Remove the --clean flag from args since the binary doesn't expect it
    args.splice(cleanFlagIndex, 1);
  }

  console.log(`Starting midnight-indexer binary at: ${binaryPath}`);

  const dataDir = path.join(workingDir, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const childProcess = spawn(binaryPath, args, {
    env: env,
    stdio: "inherit", // Inherit stdin, stdout, stderr from parent process
    cwd: workingDir, // Run from inside the indexer-standalone directory
  });

  childProcess.on("spawn", () => {
    console.log(
      `midnight-indexer process spawned with PID: ${childProcess.pid}`,
    );
  });

  childProcess.on("error", (error) => {
    console.error("Failed to start midnight-indexer:", error);
  });

  childProcess.on("exit", (code, signal) => {
    if (code !== null) {
      console.log(`midnight-indexer process exited with code: ${code}`);
    } else {
      console.log(`midnight-indexer process terminated by signal: ${signal}`);
    }
  });

  return childProcess;
}

module.exports = {
  compatibility,
  ensureConfigExists,
  isValidIndexerSecret,
  runMidnightIndexer,
  waitForChildCompletion,
  waitForNodeBlock,
};
