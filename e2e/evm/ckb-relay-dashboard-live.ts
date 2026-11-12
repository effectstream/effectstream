import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdir, mkdtemp, writeFile, access, rm, rename, cp } from "node:fs/promises";
import net from "node:net";
import pg from "pg";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { hardhat } from "viem/chains";
import type { CkbCellCreatedEventV1 } from "ckb-multichain-connector";
import { normalizeCkbEvent, relayAbi, relayPayloadHash } from "./tooling/ckb-event-relay.ts";
import {
  assertCkbAcceptancePortFree,
  ckbAcceptanceDatabaseUrl,
  resolveCkbAcceptanceDbPort,
  stopOwnedPostgres,
} from "./postgres-config.ts";

const repo = resolve(import.meta.dirname!, "../..");
const fixedPorts = [8114, 28114, 8545, 8546, 4747, 9999, 3334, 4173];
const pgPort = resolveCkbAcceptanceDbPort(process.env.CKB_ACCEPTANCE_DB_PORT);
const expectedOffckb = "0.4.13";
const expectedCkb = "0.208.0";
const pgBindir = process.env.REPRO_PG_BINDIR;
const taskRoot = await makeEvidenceDir();
const logDir = join(taskRoot, "logs");
const ckbRoot = join(taskRoot, "offckb");
const ckbConfig = join(ckbRoot, "config");
const ckbData = join(ckbRoot, "data");
const pgData = join(taskRoot, "postgres-data");
const pgSocket = join(taskRoot, "postgres-socket");
const xdgConfig = join(taskRoot, "xdg-config");
const xdgData = join(taskRoot, "xdg-data");
const pgLog = join(logDir, "postgres.log");
const dashboardLog = join(logDir, "dashboard.log");
const e2eLog = join(logDir, "evm-e2e.log");
const offckbLog = join(logDir, "offckb.log");
const ignitionDeployments = join(repo, "e2e/shared/contracts/evm/ignition/deployments");
const deploymentBackup = join(taskRoot, "previous-ignition-deployments");
const deploymentEvidence = join(taskRoot, "run-ignition-deployments");
const deploymentStage = join(repo, "e2e/shared/contracts/evm/ignition", `.dashboard-live-stage-${process.pid}`);
const pgPool = new pg.Pool({
  host: "127.0.0.1", port: pgPort, user: "effectstream", database: "effectstream",
  password: "local-trust-only", max: 4, connectionTimeoutMillis: 1500,
});

let pgStarted = false;
let offckbStarted = false;
let dashboardProcess: Bun.Subprocess | undefined;
let orchestratorMayBeRunning = false;
let closing = false;
let signingKeyPath: string | undefined;
let deploymentIsolationActive = false;
const preservedDeploymentChains: string[] = [];
const children = new Set<Bun.Subprocess>();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function makeEvidenceDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ckb-relay-dashboard-live-"));
}

async function writeTaskOffckbSettings(): Promise<void> {
  const dataRoot = join(homedir(), ".local/share/offckb-nodejs");
  const settings = {
    bins: {
      rootFolder: join(dataRoot, "bins"), defaultCKBVersion: expectedCkb,
      downloadPath: join(taskRoot, "downloads"),
    },
    devnet: {
      rpcUrl: "http://127.0.0.1:8114", rpcProxyPort: 28114,
      configPath: ckbConfig, dataPath: ckbData,
      debugFullTransactionsPath: join(ckbRoot, "full-transactions"),
      transactionsPath: join(ckbRoot, "transactions"),
    },
    tools: {
      rootFolder: join(dataRoot, "tools"),
      ckbDebugger: { minVersion: "0.200.0" },
      ckbTui: { version: "v0.1.4" },
    },
  };
  await mkdir(join(xdgConfig, "offckb-nodejs"), { recursive: true });
  await mkdir(xdgData, { recursive: true });
  await writeFile(join(xdgConfig, "offckb-nodejs/settings.json"), JSON.stringify(settings, null, 2));
}

function findExecutable(name: string): string | undefined {
  const result = spawnSync("bash", ["-c", `command -v ${name}`], { encoding: "utf8", env: envBase });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

const envBase: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
for (const key of [
  "EFFECTSTREAM_EVM_RPC_URL", "EFFECTSTREAM_EVM_CHAIN_ID", "EFFECTSTREAM_EVM_PRIVATE_KEY",
  "EFFECTSTREAM_EVM_ALLOW_REMOTE", "CKB_RPC_URL", "CKB_GENESIS_BLOCK_HASH",
  "CKB_RELAY_EXPECTED_TX", "DATABASE_URL",
  "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PW", "PGHOST", "PGPORT", "PGUSER",
  "PGPASSWORD", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGDATA",
]) delete envBase[key];
envBase.PATH = `${process.env.PATH ?? ""}:/home/farmers-boy/.foundry/versions/foundry-rs/foundry/v1.8.6`;
envBase.XDG_CONFIG_HOME = xdgConfig;
envBase.XDG_DATA_HOME = xdgData;

function localEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...envBase, ...overrides };
}

async function portIsFree(port: number): Promise<boolean> {
  return await new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once("error", () => resolvePromise(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
  });
}

async function preflight(): Promise<{ offckb: string; forge: string; chrome: string; pgBin: string }> {
  const offckb = findExecutable("offckb");
  const bundledForge = join(homedir(), ".foundry/versions/foundry-rs/foundry/v1.8.6/forge");
  const forge = await access(bundledForge).then(() => bundledForge, () => findExecutable("forge"));
  const chrome = findExecutable("google-chrome") ?? "/usr/bin/google-chrome";
  assert(offckb, "offckb is required. Install @offckb/cli 0.4.13 before running the live demo.");
  assert(forge, "Foundry forge is required on PATH to compile the local EVM contracts.");
  assert(pgBindir, "Set REPRO_PG_BINDIR to PostgreSQL 16, 17, or 18 bin directory (initdb, pg_ctl, psql). See the dashboard README.");
  for (const binary of ["initdb", "pg_ctl", "pg_isready", "psql", "postgres"]) {
    await access(join(pgBindir, binary)).catch(() => { throw new Error(`Missing ${binary} in REPRO_PG_BINDIR=${pgBindir}.`); });
  }
  for (const port of fixedPorts) {
    assert(await portIsFree(port), `Preflight refused to start: loopback port ${port} is already occupied. Stop the owning service yourself; this script will not kill it.`);
  }
  await assertCkbAcceptancePortFree(pgPort, portIsFree);
  const offckbVersion = await capture(offckb, ["--version"]);
  assert(offckbVersion.code === 0 && offckbVersion.stdout.trim() === expectedOffckb,
    `Expected OffCKB ${expectedOffckb}; found ${offckbVersion.stdout.trim() || "unknown version"}.`);
  const ckbBinary = join(homedir(), `.local/share/offckb-nodejs/bins/${expectedCkb}/ckb`);
  await access(ckbBinary).catch(() => { throw new Error(`OffCKB CKB ${expectedCkb} binary is missing at its installed version path: ${ckbBinary}. Install it with the supported OffCKB CLI, then retry.`); });
  const ckbVersion = await capture(ckbBinary, ["--version"]);
  assert(ckbVersion.code === 0 && ckbVersion.stdout.includes(expectedCkb),
    `Expected CKB ${expectedCkb}; found ${ckbVersion.stdout.trim() || "unknown version"}.`);
  return { offckb, forge, chrome, pgBin: pgBindir };
}

async function capture(command: string, args: string[], env = envBase): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([command, ...args], { cwd: repo, env, stdout: "pipe", stderr: "pipe" });
  children.add(proc);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  children.delete(proc);
  return { code, stdout, stderr };
}

function spawnLogged(command: string, args: string[], logPath: string, env = envBase, cwd = repo): Bun.Subprocess {
  const proc = Bun.spawn([command, ...args], {
    cwd, env, stdout: Bun.file(logPath), stderr: Bun.file(logPath),
  });
  children.add(proc);
  void proc.exited.then(() => children.delete(proc));
  return proc;
}

async function runChecked(command: string, args: string[], env = envBase, cwd = repo): Promise<string> {
  const result = await capture(command, args, env);
  if (result.code !== 0) throw new Error(`${command} ${args[0] ?? ""} failed (exit ${result.code}): ${(result.stderr || result.stdout).trim().slice(-3000)}`);
  return result.stdout.trim();
}

async function waitFor<T>(label: string, fn: () => Promise<T | null>, timeoutMs = 120_000): Promise<T> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await fn();
      if (result !== null) return result;
    } catch (error) { lastError = error; }
    await Bun.sleep(400);
  }
  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)}s${lastError ? ` (${lastError instanceof Error ? lastError.message : "last poll failed"})` : ""}.`);
}

async function rpc(url: string, method: string, params: unknown[] = []): Promise<any> {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(2500),
  });
  const body = await response.json() as any;
  if (!response.ok || body.error) throw new Error(`${method} RPC failed`);
  return body.result;
}

async function startPostgres(pgBin: string): Promise<void> {
  await mkdir(pgData, { recursive: true });
  await mkdir(pgSocket, { recursive: true, mode: 0o700 });
  const libDir = join(pgBin, "../../..", "x86_64-linux-gnu");
  const postgresEnv = localEnv({
    LC_ALL: "C", LANG: "C",
    LD_LIBRARY_PATH: [process.env.LD_LIBRARY_PATH, libDir].filter(Boolean).join(":"),
  });
  const init = await runChecked(join(pgBin, "initdb"), ["-D", pgData, "-U", "effectstream", "--auth-local=trust", "--auth-host=trust", "--locale=C"], postgresEnv);
  await writeFile(join(logDir, "postgres-initdb.log"), init);
  await runChecked(join(pgBin, "pg_ctl"), [
    "-D", pgData, "-l", pgLog, "-o", `-h 127.0.0.1 -p ${pgPort} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${pgSocket}`, "-w", "start",
  ], postgresEnv);
  pgStarted = true;
  await runChecked(join(pgBin, "createdb"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "effectstream", "effectstream"], postgresEnv);
  await waitFor("PostgreSQL readiness", async () => {
    const result = await capture(join(pgBin, "pg_isready"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "effectstream"], postgresEnv);
    return result.code === 0 ? true : null;
  }, 30_000);
  const identity = await runChecked(join(pgBin, "psql"), [
    "-h", "127.0.0.1", "-p", String(pgPort), "-U", "effectstream", "-d", "effectstream", "-At", "-c",
    "SELECT current_database() || '|' || current_user || '|' || host(inet_server_addr()) || '|' || inet_server_port()",
  ], postgresEnv);
  assert(identity === `effectstream|effectstream|127.0.0.1|${pgPort}`, `Unexpected PostgreSQL identity: ${identity}`);
  await writeFile(join(taskRoot, "database-identity.txt"), `${identity}\nPostgreSQL version: ${(await runChecked(join(pgBin, "postgres"), ["--version"], postgresEnv))}\n`);
}

async function startOffckb(offckb: string): Promise<{ genesisHash: string; account: string }> {
  await writeTaskOffckbSettings();
  const command = spawnLogged(offckb, ["node", "--daemon", expectedCkb], offckbLog, localEnv());
  const result = await Promise.race([
    command.exited.then((code) => ({ code })),
    Bun.sleep(2000).then(() => null),
  ]);
  if (result && result.code !== 0) throw new Error(`OffCKB failed to launch (exit ${result.code}); see ${offckbLog}`);
  offckbStarted = true;
  const url = "http://127.0.0.1:8114";
  const tip = await waitFor("OffCKB RPC", async () => {
    try { return await rpc(url, "get_tip_header"); } catch { return null; }
  }, 180_000);
  await waitFor("OffCKB indexer", async () => {
    try { return await rpc(url, "get_indexer_tip"); } catch { return null; }
  }, 180_000);
  const genesis = await rpc(url, "get_block_by_number", ["0x0"]);
  const accounts = await capture(offckb, ["--json", "accounts"], localEnv());
  assert(accounts.code === 0, `offckb accounts failed; see ${offckbLog}`);
  const accountMatch = accounts.stdout.match(/(?:ckt|ckb)1[a-z0-9]{30,}/i);
  assert(accountMatch, "OffCKB returned no public local devnet account address.");
  await writeFile(join(taskRoot, "source-chain.txt"), [
    `rpc=${url}`, `genesis=${genesis.header.hash}`, `tip=${tip.number}`, `account=${accountMatch[0]}`,
  ].join("\n") + "\n");
  return { genesisHash: genesis.header.hash, account: accountMatch[0] };
}

async function startDashboard(): Promise<Bun.Subprocess> {
  const databaseUrl = ckbAcceptanceDatabaseUrl(pgPort);
  const dashboardEnv = localEnv({
    DATABASE_URL: databaseUrl,
    DASHBOARD_CKB_RPC_URL: "http://127.0.0.1:8114",
    DASHBOARD_EVM_RPC_URL: "http://127.0.0.1:8545",
    DASHBOARD_CKB_PROTOCOL: "ckbRelayEvents",
    DASHBOARD_PORT: "4173",
  });
  const app = spawnLogged("bun", ["run", "start"], dashboardLog, dashboardEnv, join(repo, "apps/ckb-relay-dashboard"));
  dashboardProcess = app;
  await waitFor("Dashboard HTTP server", async () => {
    try {
      const response = await fetch("http://127.0.0.1:4173/api/v1/status");
      return response.ok ? true : null;
    } catch { return null; }
  }, 30_000);
  return app;
}

async function submitSourceTransaction(offckb: string, address: string): Promise<string> {
  const accounts = await capture(offckb, ["accounts", "--show-private-keys"], localEnv());
  assert(accounts.code === 0, `Unable to read the built-in disposable OffCKB account key; see ${offckbLog}`);
  const privateKey = accounts.stdout.match(/^privkey:\s*(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64})\s*$/m)?.[1];
  assert(privateKey, "OffCKB did not report its disposable account 0 key in the documented format.");
  signingKeyPath = join(taskRoot, "offckb-account0.key");
  await writeFile(signingKeyPath, `${privateKey}\n`, { mode: 0o600 });
  const result = await capture(offckb, ["--json", "transfer", address, "1", "--privkey-file", signingKeyPath], localEnv());
  await rm(signingKeyPath, { force: true });
  signingKeyPath = undefined;
  await writeFile(join(logDir, "source-transfer.log"), `exit=${result.code}\n${result.stdout}\n${result.stderr}`);
  if (result.code !== 0) throw new Error(`Local OffCKB transfer failed; see ${join(logDir, "source-transfer.log")}`);
  const hash = result.stdout.match(/0x[a-fA-F0-9]{64}/)?.[0];
  assert(hash, "OffCKB transfer returned no transaction hash.");
  await writeFile(join(taskRoot, "source-transaction.txt"), `${hash}\n`);
  return hash;
}

async function startE2eRunner(genesisHash: string, sourceTx: string): Promise<number> {
  const env = localEnv({
    PGLITE: "false", DB_HOST: "127.0.0.1", DB_PORT: String(pgPort), DB_NAME: "effectstream",
    DB_USER: "effectstream", DB_PW: "local-trust-only", ALLOW_NO_PG_IVM: "true", EFFECTSTREAM_API_PORT: "9999",
    CKB_RELAY_DEMO: "true", CKB_RELAY_KEEP_INFRA: "true", CKB_RPC_URL: "http://127.0.0.1:8114",
    CKB_GENESIS_BLOCK_HASH: genesisHash, CKB_START_BLOCK_HEIGHT: "0", CKB_RELAY_EXPECTED_TX: sourceTx,
    CKB_TARGET_SCRIPT_ROLE: "lock",
    CKB_TARGET_SCRIPT_CODE_HASH: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    CKB_TARGET_SCRIPT_HASH_TYPE: "type",
    CKB_TARGET_SCRIPT_ARGS: "0x8e42b1999f265a0078503c4acec4d5e134534297",
    E2E_MAX_RETRIES: "0",
  });
  const runner = spawnLogged("bun", ["run", "e2e/runner.ts", "evm"], e2eLog, env);
  orchestratorMayBeRunning = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<null>((resolveTimeout) => {
    timeout = setTimeout(() => resolveTimeout(null), 15 * 60_000);
  });
  const code = await Promise.race([runner.exited, timedOut]);
  if (timeout) clearTimeout(timeout);
  if (code === null) {
    runner.kill("SIGTERM");
    throw new Error(`EVM/CKB E2E did not finish within 15 minutes; see ${e2eLog}`);
  }
  if (code !== 0) throw new Error(`EVM/CKB E2E exited with ${code}; see ${e2eLog}`);
  return code;
}

async function preserveExistingIgnitionDeployments(): Promise<void> {
  await mkdir(deploymentBackup, { recursive: true });
  await mkdir(deploymentStage, { recursive: true });
  deploymentIsolationActive = true;
  try {
    for (const chain of ["chain-31337", "chain-31338"]) {
      const source = join(ignitionDeployments, chain);
      const destination = join(deploymentBackup, chain);
      try {
        await access(source);
        await cp(source, destination, { recursive: true, errorOnExist: true });
        await rename(source, join(deploymentStage, chain));
        preservedDeploymentChains.push(chain);
      } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  } catch (error) {
    for (const chain of preservedDeploymentChains) {
      await rename(join(deploymentStage, chain), join(ignitionDeployments, chain));
    }
    deploymentIsolationActive = false;
    throw error;
  }
}

async function restoreIgnitionDeployments(): Promise<void> {
  if (!deploymentIsolationActive) return;
  for (const chain of ["chain-31337", "chain-31338"]) {
    const current = join(ignitionDeployments, chain);
    const saved = join(deploymentBackup, chain);
    try {
      await access(current);
      await mkdir(deploymentEvidence, { recursive: true });
      await cp(current, join(deploymentEvidence, chain), { recursive: true, errorOnExist: true });
      await rm(current, { recursive: true, force: true });
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await mkdir(ignitionDeployments, { recursive: true });
  for (const chain of preservedDeploymentChains) {
    await rename(join(deploymentStage, chain), join(ignitionDeployments, chain));
  }
  await rm(deploymentStage, { recursive: true, force: true });
  deploymentIsolationActive = false;
}

async function queryPersistedLiveRow(sourceTx: string): Promise<any> {
  const result = await pgPool.query(
    `SELECT event_id, destination_chain_id::text, destination_contract, source_event, status, attempts,
            next_attempt_at, lease_until, transaction_hash, payload_hash, receipt_status,
            receipt_block_number::text, last_error
       FROM effectstream.ckb_evm_relay_outbox
      WHERE lower(source_event->'source'->>'transactionHash') = lower($1)
      ORDER BY created_at`, [sourceTx],
  );
  return result.rows.length ? result.rows : null;
}

async function checkLiveEvidence(sourceTx: string): Promise<any> {
  const rows = await waitFor("persisted confirmed CKB outbox event", async () => {
    try {
      const result = await queryPersistedLiveRow(sourceTx);
      return result && result.length ? result : null;
    } catch { return null; }
  }, 120_000);
  assert(rows.length >= 1, `Expected one or more outbox intents for the source transaction; found ${rows.length}.`);
  const publicClient = createPublicClient({ chain: hardhat, transport: http("http://127.0.0.1:8545") });
  assert(await publicClient.getChainId() === 31337, "Hardhat RPC is not chain ID 31337.");
  let verified = 0;
  for (const row of rows) {
    assert(row.status === "confirmed", `Expected confirmed outbox state, got ${row.status}.`);
    assert(row.destination_chain_id === "31337", `Unexpected destination chain ${row.destination_chain_id}.`);
    assert(row.receipt_status === "success", `Persisted receipt status is ${row.receipt_status}.`);
    assert(row.transaction_hash && row.payload_hash, "Outbox has no persisted transaction or payload hash.");
    const source = row.source_event as CkbCellCreatedEventV1;
    const payload = normalizeCkbEvent(source);
    const contract = row.destination_contract as Address;
    const receipt = await publicClient.getTransactionReceipt({ hash: row.transaction_hash as Hex });
    assert(receipt.status === "success", `On-chain EVM receipt is ${receipt.status}.`);
    assert(receipt.to?.toLowerCase() === contract.toLowerCase(), "Destination receipt targets a different contract.");
    const storedHash = await publicClient.readContract({
      address: contract, abi: relayAbi, functionName: "acceptedPayloadHash", args: [payload.eventId],
    });
    const calculated = relayPayloadHash(payload, 31337n, contract);
    assert(row.payload_hash.toLowerCase() === storedHash.toLowerCase(), "Persisted payload hash differs from contract storage.");
    assert(calculated.toLowerCase() === storedHash.toLowerCase(), "Calculated payload hash differs from contract storage.");
    verified++;
  }
  assert(verified === rows.length, "Not all persisted live intents have matching receipts and contract hashes.");
  // A real CKB transfer can create multiple matching cells; select the final
  // indexed output for the dashboard detail/restart checks.
  const row = rows[rows.length - 1];
  const source = row.source_event as CkbCellCreatedEventV1;
  const payload = normalizeCkbEvent(source);
  const contract = row.destination_contract as Address;
  const receipt = await publicClient.getTransactionReceipt({ hash: row.transaction_hash as Hex });
  const storedHash = await publicClient.readContract({
    address: contract, abi: relayAbi, functionName: "acceptedPayloadHash", args: [payload.eventId],
  });
  const calculated = relayPayloadHash(payload, 31337n, contract);
  return { ...row, source, receipt, storedHash, calculated };
}

async function dashboardApiChecks(row: any): Promise<void> {
  const statusResponse = await fetch("http://127.0.0.1:4173/api/v1/status");
  assert(statusResponse.ok, "Dashboard status endpoint is unavailable.");
  const status = await statusResponse.json() as any;
  assert(status.database.status === "connected", "Dashboard is not connected to the live PostgreSQL database.");
  assert(status.source.status === "connected", "Dashboard does not report the live OffCKB RPC connected.");
  assert(status.destination.status === "connected" && status.destination.chainId === 31337, "Dashboard does not report local EVM chain 31337 connected.");
  const search = new URLSearchParams({ page: "1", pageSize: "1", q: row.event_id });
  const listResponse = await fetch(`http://127.0.0.1:4173/api/v1/events?${search}`);
  const list = await listResponse.json() as any;
  assert(listResponse.ok && list.total === 1 && list.items[0]?.event_id === row.event_id, "Dashboard event search did not return the actual outbox row.");
  const detailResponse = await fetch(`http://127.0.0.1:4173/api/v1/events/${encodeURIComponent(row.event_id)}`);
  const detail = await detailResponse.json() as any;
  assert(detailResponse.ok && detail.event.event_id === row.event_id, "Dashboard detail endpoint did not return the persisted event.");
  assert(detail.execution.outbox.status === "confirmed", "Dashboard does not display confirmed outbox state.");
  assert(detail.execution.destination.transactionHash === row.transaction_hash, "Dashboard transaction hash differs from PostgreSQL.");
  assert(detail.execution.destination.receiptStatus === "success", "Dashboard receipt status differs from PostgreSQL.");
  assert(detail.execution.destination.payloadHash.toLowerCase() === row.storedHash.toLowerCase(), "Dashboard payload hash differs from on-chain contract storage.");
  const emptyResponse = await fetch("http://127.0.0.1:4173/api/v1/events?page=1&pageSize=1&q=no-such-local-relay-event");
  const empty = await emptyResponse.json() as any;
  assert(emptyResponse.ok && empty.total === 0 && empty.items.length === 0, "Dashboard search did not return a truthful empty result.");
  await writeFile(join(taskRoot, "dashboard-api-evidence.json"), JSON.stringify({ status, event: detail, filteredCount: list.total, emptyCount: empty.total }, null, 2));
}

async function restartDashboard(row: any): Promise<void> {
  assert(dashboardProcess, "Dashboard process was not started by this run.");
  dashboardProcess.kill("SIGTERM");
  await dashboardProcess.exited;
  dashboardProcess = undefined;
  await startDashboard();
  const response = await fetch(`http://127.0.0.1:4173/api/v1/events/${encodeURIComponent(row.event_id)}`);
  const data = await response.json() as any;
  assert(response.ok && data.event.event_id === row.event_id && data.execution.outbox.status === "confirmed", "Event did not persist through dashboard restart.");
}

async function restartWorkerAndVerify(row: any): Promise<void> {
  const restarted = await fetch("http://127.0.0.1:4747/restart", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "ckb-relay-worker" }),
  });
  assert(restarted.ok, "Orchestrator could not restart the existing relay worker.");
  await waitFor("relay worker process after restart", async () => {
    const response = await fetch("http://127.0.0.1:4747/processes");
    if (!response.ok) return null;
    const data = await response.json() as any;
    const worker = data.processes.find((process: any) => process.name === "ckb-relay-worker");
    return worker?.status === "running" ? true : null;
  }, 30_000);
  await Bun.sleep(1500);
  const result = await pgPool.query(
    `SELECT count(*)::int AS count, min(status) AS status, count(DISTINCT transaction_hash)::int AS tx_count
       FROM effectstream.ckb_evm_relay_outbox WHERE event_id = $1`, [row.event_id],
  );
  assert(result.rows[0]?.count === 1 && result.rows[0]?.status === "confirmed" && result.rows[0]?.tx_count === 1,
    "Worker restart changed or duplicated the confirmed destination execution.");
}

async function screenshotDashboard(chrome: string, row: any): Promise<void> {
  const dom = await capture(chrome, [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--virtual-time-budget=8000", "--dump-dom", "http://127.0.0.1:4173",
  ], localEnv());
  assert(dom.code === 0 && dom.stdout.includes(row.event_id) && dom.stdout.includes("confirmed"),
    "Headless browser did not render the actual confirmed event in the dashboard feed.");
  const image = join(taskRoot, "dashboard-confirmed-event.png");
  const shot = await capture(chrome, [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--run-all-compositor-stages-before-draw", "--virtual-time-budget=8000",
    "--window-size=1600,1100", `--screenshot=${image}`, "http://127.0.0.1:4173",
  ], localEnv());
  assert(shot.code === 0, `Chrome screenshot failed: ${shot.stderr.slice(-1000)}`);
}

async function cleanup(): Promise<void> {
  if (closing) return;
  closing = true;
  if (dashboardProcess) {
    try { dashboardProcess.kill("SIGTERM"); await dashboardProcess.exited; } catch { /* already exited */ }
    dashboardProcess = undefined;
  }
  if (signingKeyPath) {
    await rm(signingKeyPath, { force: true });
    signingKeyPath = undefined;
  }
  if (orchestratorMayBeRunning) {
    try { await fetch("http://127.0.0.1:4747/shutdown", { method: "POST", signal: AbortSignal.timeout(3000) }); } catch { /* runner or orchestrator already shut down */ }
    orchestratorMayBeRunning = false;
  }
  await restoreIgnitionDeployments().catch((error) => {
    console.error(`Could not restore prior ignored Ignition deployment records: ${error instanceof Error ? error.message : "restore failed"}`);
  });
  if (offckbStarted) {
    const offckb = findExecutable("offckb");
    if (offckb) {
      await capture(offckb, ["node", "stop"], localEnv()).catch(() => undefined);
    }
    offckbStarted = false;
  }
  try { await pgPool.end(); } catch { /* may not have connected */ }
  if (pgBindir) {
    const libDir = join(pgBindir, "../../..", "x86_64-linux-gnu");
    await stopOwnedPostgres(pgStarted, async () => {
      await capture(join(pgBindir, "pg_ctl"), ["-D", pgData, "-m", "fast", "-w", "stop"], localEnv({
        LD_LIBRARY_PATH: [process.env.LD_LIBRARY_PATH, libDir].filter(Boolean).join(":"), LC_ALL: "C", LANG: "C",
      }));
      pgStarted = false;
    }).catch(() => undefined);
  }
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch { /* already exited */ }
  }
}

try {
  await mkdir(logDir, { recursive: true });
  const tools = await preflight();
  await writeFile(join(taskRoot, "tool-versions.txt"), [
    `Bun ${Bun.version}`, `OffCKB ${expectedOffckb}`, `CKB ${expectedCkb}`,
    `${await runChecked(join(tools.pgBin, "postgres"), ["--version"], localEnv({ LD_LIBRARY_PATH: join(tools.pgBin, "../../..", "x86_64-linux-gnu") }))}`,
    `Foundry forge ${ (await runChecked(tools.forge, ["--version"])).split("\n")[0] }`,
  ].join("\n") + "\n");
  console.log(`Evidence directory: ${taskRoot}`);
  await writeFile(join(taskRoot, "acceptance-db-port.txt"), `${pgPort}\n`);
  console.log("Preflight passed: all service ports are free; only loopback local services will be started.");
  await startPostgres(tools.pgBin);
  const offckb = await startOffckb(tools.offckb);
  const sourceTx = await submitSourceTransaction(tools.offckb, offckb.account);
  console.log(`Submitted local OffCKB transaction ${sourceTx}`);
  await startDashboard();
  await preserveExistingIgnitionDeployments();
  await startE2eRunner(offckb.genesisHash, sourceTx);
  const persistedRows = await waitFor("processed source event", () => queryPersistedLiveRow(sourceTx), 120_000);
  const row = await checkLiveEvidence(sourceTx);
  assert(persistedRows.length >= 1, "Source transaction must map to at least one persisted relay event.");
  await dashboardApiChecks(row);
  await restartDashboard(row);
  await restartWorkerAndVerify(row);
  await screenshotDashboard(tools.chrome, row);
  await writeFile(join(taskRoot, "acceptance-summary.json"), JSON.stringify({
    result: "live-local-evidence-verified",
    offckbVersion: expectedOffckb,
    ckbVersion: expectedCkb,
    database: `127.0.0.1:${pgPort}/effectstream`,
    source: {
      genesisHash: offckb.genesisHash,
      eventId: row.event_id,
      blockHeight: row.source.source.blockHeight,
      blockHash: row.source.source.blockHash,
      transactionHash: row.source.source.transactionHash,
    },
    outbox: { status: row.status, attempts: row.attempts, destinationChainId: row.destination_chain_id, contract: row.destination_contract },
    destination: {
      transactionHash: row.transaction_hash,
      receiptStatus: row.receipt.status,
      receiptBlock: row.receipt.blockNumber.toString(),
      persistedPayloadHash: row.payload_hash,
      contractPayloadHash: row.storedHash,
      calculatedPayloadHash: row.calculated,
    },
    dashboard: "http://127.0.0.1:4173",
    screenshot: join(taskRoot, "dashboard-confirmed-event.png"),
  }, null, 2));
  console.log(`Verified source event ${row.event_id} at CKB block ${row.source.source.blockHeight}`);
  console.log(`Outbox ${row.status}; destination tx ${row.transaction_hash}; receipt ${row.receipt.status}; payload hash ${row.storedHash}`);
  console.log("Dashboard API, rendered DOM, dashboard restart, and worker restart all verified against the same PostgreSQL database.");
  console.log(`Screenshot: ${join(taskRoot, "dashboard-confirmed-event.png")}`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Live dashboard E2E failed.";
  await writeFile(join(logDir, "failure.txt"), `${message}\n`).catch(() => undefined);
  console.error(`Live dashboard E2E failed: ${message}`);
  console.error(`Inspect logs and preserved temporary state at ${taskRoot}`);
  process.exitCode = 1;
} finally {
  await cleanup();
  console.log(`Disposable services stopped; logs and evidence retained at ${taskRoot}`);
}
