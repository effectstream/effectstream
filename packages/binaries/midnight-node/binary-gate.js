#!/usr/bin/env node
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const nodeBinary = require("./binary");
const { runMidnightNode } = require("./run_midnight_node");
const indexerBinary = require("../midnight-indexer/binary");
const {
  runMidnightIndexer,
  waitForNodeBlock,
} = require("../midnight-indexer/run_midnight_indexer");
const proofBinary = require("../midnight-proof-server/binary");
const {
  runMidnightProofServer,
} = require("../midnight-proof-server/run_midnight_proof_server");

const WRAPPERS = [
  ["node", nodeBinary],
  ["indexer", indexerBinary],
  ["proof", proofBinary],
];

async function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function randomFreePort(excluded) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const port = 10001 + Math.floor(Math.random() * 50000);
    if (!excluded.has(port) && await canListen(port)) {
      excluded.add(port);
      return port;
    }
  }
  throw new Error("Could not allocate a random free port above 10000");
}

async function waitFor(label, check, child, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child && !isChildRunning(child)) {
      throw new Error(
        `${label} process exited early with ` +
          `${child.exitCode ?? child.signalCode}`,
      );
    }
    try {
      return await check();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become healthy: ${lastError}`);
}

function isChildRunning(child) {
  return child && child.exitCode === null && child.signalCode === null;
}

async function rpc(port, method, id) {
  const response = await fetch(`http://127.0.0.1:${port}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: [] }),
  });
  const body = await response.json();
  if (!response.ok || body.error || body.result === undefined) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function stopChild(child) {
  if (!isChildRunning(child)) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (isChildRunning(child)) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function cleanCaches() {
  for (const [, wrapper] of WRAPPERS) await wrapper.cleanBinaries();
}

async function main() {
  const platform = nodeBinary.getPlatform();
  if (!['macos-arm64', 'linux-amd64'].includes(platform)) {
    throw new Error(`Native binary gate is unsupported on ${platform}`);
  }
  if (platform === "macos-arm64" && (os.platform() !== "darwin" || os.arch() !== "arm64")) {
    throw new Error("macos-arm64 gate must execute natively on Apple Silicon");
  }

  const ports = new Set();
  const nodeRpcPort = await randomFreePort(ports);
  const nodeP2pPort = await randomFreePort(ports);
  const nodeMetricsPort = await randomFreePort(ports);
  const proofPort = await randomFreePort(ports);
  const indexerPort = await randomFreePort(ports);
  const indexerMetricsPort = await randomFreePort(ports);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "effectstream-m2b-gate-"));
  const children = { node: null, proof: null, indexer: null };
  const evidence = { platform, ports: [...ports], assets: {} };

  try {
    await cleanCaches();
    for (const [name, wrapper] of WRAPPERS) {
      const asset = wrapper.getAsset(platform);
      const first = await wrapper.binary({ platform });
      if (!first.downloaded || !wrapper.isBinaryCacheValid({ asset })) {
        throw new Error(`${name} did not produce a valid clean-download cache`);
      }
      if ((fs.statSync(first.binaryPath).mode & 0o111) === 0) {
        throw new Error(`${name} extracted binary is not executable`);
      }
      if (fs.existsSync(wrapper.getPaths(undefined, asset).archivePath)) {
        throw new Error(`${name} archive was not removed after extraction`);
      }
      const second = await wrapper.binary({ platform });
      if (second.downloaded) {
        throw new Error(`${name} clean cache unexpectedly downloaded twice`);
      }
      evidence.assets[name] = {
        archiveName: asset.archiveName,
        archiveSha256: asset.sha256,
        targetVersion: asset.version,
      };
    }

    const nodePath = nodeBinary.getPaths().binaryPath;
    const indexerPath = indexerBinary.getPaths().binaryPath;
    const nodeCli = (await execFileAsync(nodePath, ["--version"])).stdout.trim();
    const indexerCli = (
      await execFileAsync(indexerPath, ["--version"], {
        cwd: path.dirname(indexerPath),
      })
    ).stdout.trim();
    if (nodeCli !== "midnight-node 2.0.0") {
      throw new Error(`Unexpected node CLI version: ${nodeCli}`);
    }
    if (!indexerCli.includes("4.4.0-rc.1") || !indexerCli.includes("668ed025")) {
      throw new Error(`Unexpected indexer CLI version: ${indexerCli}`);
    }
    evidence.nodeCli = nodeCli;
    evidence.indexerCli = indexerCli;

    children.node = runMidnightNode(process.env, [
      "--dev",
      "--rpc-port",
      String(nodeRpcPort),
      "--port",
      String(nodeP2pPort),
      "--prometheus-port",
      String(nodeMetricsPort),
    ]);
    evidence.nodeHealth = await waitFor(
      "node health",
      () => rpc(nodeRpcPort, "system_health", 1),
      children.node,
    );
    evidence.nodeVersion = await waitFor(
      "node version",
      () => rpc(nodeRpcPort, "system_version", 2),
      children.node,
    );
    if (evidence.nodeVersion !== "2.0.0-651e043b61e") {
      throw new Error(`Unexpected node RPC version: ${evidence.nodeVersion}`);
    }

    children.proof = runMidnightProofServer(process.env, [
      "--no-fetch-params",
      "--port",
      String(proofPort),
    ]);
    evidence.proofVersion = await waitFor(
      "proof server",
      async () => {
        const response = await fetch(`http://127.0.0.1:${proofPort}/version`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.text()).trim();
      },
      children.proof,
    );
    if (evidence.proofVersion !== "9.0.0-rc.5") {
      throw new Error(`Unexpected proof-server version: ${evidence.proofVersion}`);
    }

    const indexerEnv = {
      ...process.env,
      APP__INFRA__SECRET:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      LEDGER_NETWORK_ID: "Undeployed",
      SUBSTRATE_NODE_WS_URL: `ws://127.0.0.1:${nodeRpcPort}`,
      APP__APPLICATION__NETWORK_ID: "undeployed",
      APP__INFRA__NODE__URL: `ws://127.0.0.1:${nodeRpcPort}`,
      APP__INFRA__SPO_NODE__URL: `ws://127.0.0.1:${nodeRpcPort}`,
      APP__INFRA__SPO_NODE__BLOCKFROST_ID: "m2b-local-no-spo",
      APP__INFRA__STORAGE__CNN_URL: path.join(stateDir, "indexer.sqlite"),
      APP__INFRA__LEDGER_DB__CNN_URL: path.join(stateDir, "ledger.sqlite"),
      APP__INFRA__API__ADDRESS: "127.0.0.1",
      APP__INFRA__API__PORT: String(indexerPort),
      APP__TELEMETRY__METRICS__PORT: String(indexerMetricsPort),
    };
    await waitForNodeBlock(indexerEnv, { timeoutMs: 60000 });
    children.indexer = runMidnightIndexer(indexerEnv, []);
    evidence.indexerHealth = await waitFor(
      "indexer GraphQL",
      async () => {
        const response = await fetch(
          `http://127.0.0.1:${indexerPort}/api/v3/graphql`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: "{ __typename }" }),
          },
        );
        const body = await response.json();
        if (!response.ok || body.errors) {
          throw new Error(`GraphQL health failed: ${JSON.stringify(body)}`);
        }
        return body;
      },
      children.indexer,
    );

    console.log(`M2B_NATIVE_GATE_PASS ${JSON.stringify(evidence)}`);
  } finally {
    await stopChild(children.indexer);
    await stopChild(children.proof);
    await stopChild(children.node);
    await cleanCaches();
    fs.rmSync(stateDir, { force: true, recursive: true });
    for (const port of ports) {
      if (!await canListen(port)) {
        throw new Error(`Cleanup failed: port ${port} remains unavailable`);
      }
    }
    console.log(
      `M2B_NATIVE_GATE_CLEANUP_PASS ports=${[...ports].join(",")} caches=clean state=removed`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
