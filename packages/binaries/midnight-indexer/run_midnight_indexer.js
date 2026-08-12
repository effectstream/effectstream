const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const axios = require("axios");
const { ensureRuntimeDirectory } = require("@effectstream/binary-runtime");

async function waitForNodeBlock(env, opts = {}) {
  const { minBlock = 1, timeoutMs = 120000, intervalMs = 1000 } = opts;
  const wsUrl = env.SUBSTRATE_NODE_WS_URL || env.APP__INFRA__NODE__URL || "ws://localhost:9944";
  const httpUrl = wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
  const deadline = Date.now() + timeoutMs;
  console.log(`Waiting for node to produce block #${minBlock} at ${httpUrl}...`);
  while (Date.now() < deadline) {
    try {
      const { data } = await axios.post(
        httpUrl,
        { jsonrpc: "2.0", id: 1, method: "chain_getBlockHash", params: [minBlock] },
        { headers: { "Content-Type": "application/json" }, timeout: 5000 },
      );
      if (data?.result) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  console.warn(`Timed out waiting for node block #${minBlock}; starting indexer anyway.`);
}

function resolveConfigPath(env, workingDir) {
  if (!env.CONFIG_FILE) return path.join(workingDir, "config.yaml");
  return path.isAbsolute(env.CONFIG_FILE) ? env.CONFIG_FILE : path.resolve(workingDir, env.CONFIG_FILE);
}

function ensureConfigExists(configPath, env) {
  if (fs.existsSync(configPath)) return;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const networkId = env.LEDGER_NETWORK_ID || "Undeployed";
  const nodeUrl = env.SUBSTRATE_NODE_WS_URL || env.APP__INFRA__NODE__URL || "ws://localhost:9944";
  const cnnUrl = env.APP__INFRA__STORAGE__CNN_URL || "./data/indexer.sqlite";
  const apiPort = env.APP__INFRA__API__PORT || 8088;
  fs.writeFileSync(configPath, `run_migrations: true
network_id: &network_id "${networkId}"
chain_indexer_application:
  network_id: *network_id
  blocks_buffer: 60
  save_zswap_state_after: 1000
  caught_up_max_distance: 60
  caught_up_leeway: 30
wallet_indexer_application:
  network_id: *network_id
  active_wallets_repeat_delay: "100ms"
  active_wallets_ttl: "30m"
  transaction_batch_size: 10
infra:
  node:
    url: "${nodeUrl}"
    reconnect_max_delay: "10s"
    reconnect_max_attempts: 30
  storage:
    cnn_url: "${cnnUrl}"
  api:
    address: "0.0.0.0"
    port: ${apiPort}
    request_body_limit: "1MiB"
    max_complexity: 200
    max_depth: 15
    network_id: *network_id
telemetry:
  tracing:
    enabled: false
    service_name: "indexer"
  metrics:
    enabled: false
    address: "0.0.0.0"
    port: 9000
`);
}

function resolveSqlitePath(env, workingDir) {
  const configured = env.APP__INFRA__STORAGE__CNN_URL;
  if (configured) return configured;
  const configPath = resolveConfigPath(env, workingDir);
  if (!fs.existsSync(configPath)) return path.join(workingDir, "data", "indexer.sqlite");
  const parsed = yaml.load(fs.readFileSync(configPath, "utf8"));
  const value = parsed?.infra?.storage?.cnn_url || "./data/indexer.sqlite";
  return path.isAbsolute(value) ? value : path.resolve(workingDir, value);
}

function handleCleanFlag(env, workingDir) {
  let value = resolveSqlitePath(env, workingDir);
  if (value.startsWith("sqlite:///")) value = value.slice("sqlite://".length);
  else if (value.startsWith("sqlite://")) value = value.slice("sqlite://".length);
  if (fs.existsSync(value)) fs.unlinkSync(value);
}

function runMidnightIndexer(binaryPath, env = process.env, args = []) {
  const workingDir = ensureRuntimeDirectory("midnight-indexer", env);
  const configPath = resolveConfigPath(env, workingDir);
  ensureConfigExists(configPath, env);
  const forwarded = [...args];
  const cleanIndex = forwarded.indexOf("--clean");
  if (cleanIndex !== -1) {
    handleCleanFlag(env, workingDir);
    forwarded.splice(cleanIndex, 1);
  }
  fs.mkdirSync(path.join(workingDir, "data"), { recursive: true });
  const childProcess = spawn(binaryPath, forwarded, { env, stdio: "inherit", cwd: workingDir });
  childProcess.on("error", (error) => console.error("Failed to start midnight-indexer:", error));
  childProcess.on("exit", (code, signal) => {
    if (code !== null) console.log(`midnight-indexer process exited with code: ${code}`);
    else console.log(`midnight-indexer process terminated by signal: ${signal}`);
  });
  return childProcess;
}

module.exports = {
  ensureConfigExists,
  handleCleanFlag,
  resolveConfigPath,
  resolveSqlitePath,
  runMidnightIndexer,
  waitForNodeBlock,
};
