/**
 * Block finalization performance benchmark.
 *
 * Syncs exactly ~120 NTP blocks (2 minutes of chain time) from a recent
 * Arbitrum block range. Measures wall time to finalize all blocks.
 *
 * NTP startTime is set to ~2 minutes ago so only ~120 NTP blocks are generated
 * (NTP generates ALL blocks from startTime→now, so historical start times
 * would flood the system with millions of blocks).
 *
 * The Arbitrum RPC and NTP generation are fast — the bottleneck is
 * block finalization in processFinalizedBlock + merge overhead.
 *
 * Usage:
 *   ARBITRUM_RPC=https://arb-mainnet.g.alchemy.com/v2/KEY deno run -A perf-test.ts
 *
 * Optional:
 *   USE_PGSQL=true             — use real PostgreSQL instead of PGLite
 *   DB_PORT=5432               — PostgreSQL port (default: 5432 for pgsql, 5488 for pglite)
 *   DB_USER=<whoami>           — PostgreSQL user (default: current OS user)
 *   DB_NAME=perf               — PostgreSQL database (default: perf)
 *   SYNC_SECONDS=120           — seconds of chain time to benchmark (default: 120)
 *   DISABLE_MIDNIGHT=true      — skip Midnight sync (default: false)
 *   DISABLE_EVM_PRIMITIVES=true — skip EVM primitives (default: false)
 */

import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { init, start } from "@effectstream/runtime";
import { getConnection } from "@effectstream/db";
import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { call, main, sleep, spawn } from "effection";
import {
  PrimitiveTypeEVMPaimaL2,
  PrimitiveTypeMidnightGeneric,
} from "@effectstream/sm/builtin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const NTP_BLOCK_MS = 1000;
const SYNC_SECONDS = Number(Deno.env.get("SYNC_SECONDS") ?? "120");
const NTP_BLOCK_COUNT = SYNC_SECONDS; // 1 block per second
const ARB_BLOCKS_PER_SEC = 4;
const ARB_BLOCK_COUNT = SYNC_SECONDS * ARB_BLOCKS_PER_SEC;
const MIDNIGHT_BLOCK_TIME_S = 6;
const MIDNIGHT_BLOCK_COUNT = Math.ceil(SYNC_SECONDS / MIDNIGHT_BLOCK_TIME_S);
const MIDNIGHT_ENABLED = Deno.env.get("DISABLE_MIDNIGHT") !== "true";
const EVM_PRIMITIVES_ENABLED = Deno.env.get("DISABLE_EVM_PRIMITIVES") !== "true";
const TIMEOUT_S = Math.max(SYNC_SECONDS * 2, 120);

const MIDNIGHT_INDEXER = "https://indexer.mainnet.midnight.network/api/v3/graphql";
const MIDNIGHT_INDEXER_WS = "wss://indexer.mainnet.midnight.network/api/v3/graphql/ws";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const ARBITRUM_RPC = Deno.env.get("ARBITRUM_RPC");
if (!ARBITRUM_RPC) {
  console.error("ERROR: ARBITRUM_RPC env var is required");
  Deno.exit(1);
}

const USE_PGSQL = Deno.env.get("USE_PGSQL") === "true";
const DB_PORT = Number(Deno.env.get("DB_PORT") ?? (USE_PGSQL ? "5432" : "5488"));
const DB_USER = Deno.env.get("DB_USER") ?? (USE_PGSQL ? Deno.env.get("USER") ?? "postgres" : "postgres");
const DB_NAME = Deno.env.get("DB_NAME") ?? (USE_PGSQL ? "perf" : "postgres");
const DB_PW = Deno.env.get("DB_PW") ?? "";

// Set DB env vars before any module reads them
Deno.env.set("PGLITE", USE_PGSQL ? "false" : "true");
if (!USE_PGSQL) Deno.env.set("PGLITE_DATA_DIR", "memory://");
Deno.env.set("DB_PORT", String(DB_PORT));
Deno.env.set("DB_HOST", "localhost");
Deno.env.set("DB_USER", DB_USER);
Deno.env.set("DB_NAME", DB_NAME);
Deno.env.set("DB_PW", DB_PW);

// ---------------------------------------------------------------------------
// Step 1: Database setup
// ---------------------------------------------------------------------------
let pgliteProcess: Deno.ChildProcess | null = null;

if (USE_PGSQL) {
  console.log(`Using real PostgreSQL on port ${DB_PORT} (db=${DB_NAME}, user=${DB_USER})`);

  // Drop and recreate all effectstream schema objects for a clean run
  const pg = await import("pg");
  const client = new pg.default.Client({
    host: "localhost",
    port: DB_PORT,
    user: DB_USER,
    password: DB_PW || undefined,
    database: DB_NAME,
  });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS effectstream CASCADE");
  await client.query("DROP SCHEMA IF EXISTS primitives CASCADE");
  await client.end();
  console.log("Cleaned effectstream schema.\n");
} else {
  // Kill any leftover PGLite on this port
  try {
    const lsof = new Deno.Command("lsof", { args: ["-ti", `:${DB_PORT}`], stdout: "piped" });
    const pids = new TextDecoder().decode((await lsof.output()).stdout).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        try { Deno.kill(Number(pid), "SIGKILL"); } catch { /* ok */ }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch { /* lsof not found or no procs */ }

  console.log(`Starting PGLite on port ${DB_PORT}...`);

  pgliteProcess = new Deno.Command("deno", {
    args: ["run", "-A", "@effectstream/db/start-pglite", "--port", String(DB_PORT)],
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  async function waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const conn = await Deno.connect({ port });
        conn.close();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error(`PGLite did not start on port ${port} within ${timeoutMs}ms`);
  }

  await waitForPort(DB_PORT);
  console.log("PGLite ready.\n");
}

// ---------------------------------------------------------------------------
// Step 2: Fetch a recent Arbitrum block range (~2 minutes back from latest)
// ---------------------------------------------------------------------------
console.log(`Fetching latest Arbitrum block from RPC...`);

const viemClient = createPublicClient({
  chain: { ...arbitrum, rpcUrls: { default: { http: [ARBITRUM_RPC] } } },
  transport: http(ARBITRUM_RPC),
});

const latestBlock = await viemClient.getBlock({ blockTag: "latest" });
const latestBlockNumber = Number(latestBlock.number);

// Walk back to find the start block
const arbStartBlock = latestBlockNumber - ARB_BLOCK_COUNT;
const startBlockData = await viemClient.getBlock({ blockNumber: BigInt(arbStartBlock) });
const ntpStartTime = Number(startBlockData.timestamp) * 1000; // ms

// Fetch Midnight latest block if enabled
let midnightStartBlock = 1;
if (MIDNIGHT_ENABLED) {
  console.log("Fetching latest Midnight block from indexer...");
  const resp = await fetch(MIDNIGHT_INDEXER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ block { height timestamp } }" }),
  });
  const json = await resp.json();
  const midnightLatest = json.data.block.height as number;
  midnightStartBlock = Math.max(1, midnightLatest - MIDNIGHT_BLOCK_COUNT);
  console.log(`Midnight latest block:  ${midnightLatest}`);
  console.log(`Midnight start block:   ${midnightStartBlock}`);
  console.log(`Midnight blocks:        ${MIDNIGHT_BLOCK_COUNT}`);
}

console.log(`Latest Arbitrum block:  ${latestBlockNumber}`);
console.log(`Syncing from block:     ${arbStartBlock}`);
console.log(`Arbitrum blocks:        ${ARB_BLOCK_COUNT}`);
console.log(`Expected NTP blocks:    ${NTP_BLOCK_COUNT}`);
console.log(`NTP startTime:          ${new Date(ntpStartTime).toISOString()}`);
console.log();

// ---------------------------------------------------------------------------
// Step 3: Build config — NTP + Arbitrum, no primitives, no game logic
// ---------------------------------------------------------------------------
const config = new ConfigBuilder()
  .setNamespace((b) => b.setSecurityNamespace("perf-test"))
  .buildNetworks((b) => {
    let n = b
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: ntpStartTime,
        blockTimeMS: NTP_BLOCK_MS,
      })
      .addViemNetwork({
        ...arbitrum,
        name: "arbitrum",
        rpcUrls: { default: { http: [ARBITRUM_RPC] } },
      });
    if (MIDNIGHT_ENABLED) {
      n = n.addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: "mainnet",
      }) as any;
    }
    return n;
  })
  .buildDeployments((b) => b)
  .buildSyncProtocols((b) => {
    let s = b
      .addMain(
        (nets) => nets.ntp,
        () => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (nets) => (nets as any).arbitrum,
        () => ({
          name: "mainEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: ARBITRUM_RPC,
          startBlockHeight: arbStartBlock,
          pollingInterval: 1000,
          confirmationDepth: 0,
          stepSize: 100,
        }),
      );
    if (MIDNIGHT_ENABLED) {
      s = (s as any).addParallel(
        (nets: any) => nets.midnight,
        () => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: midnightStartBlock,
          pollingInterval: 6000,
          delayMs: 60000,
          stepSize: 2,
          indexer: MIDNIGHT_INDEXER,
          indexerWS: MIDNIGHT_INDEXER_WS,
        }),
      );
    }
    return s;
  })
  .buildPrimitives((b) => {
    let p: any = b;
    if (EVM_PRIMITIVES_ENABLED) {
      p = p.addPrimitive(
        (syncProtocols: any) => syncProtocols.mainEvmRPC,
        () => ({
          name: "primitive_effectstreaml2",
          type: PrimitiveTypeEVMPaimaL2,
          startBlockHeight: 0,
          contractAddress: "0x2F2Ac7B5E2Ba4FcC41914A465a0262c7AF00Fbb9",
          paimaL2Grammar: [],
        }),
      );
    }
    if (MIDNIGHT_ENABLED) {
      p = p.addPrimitive(
        (syncProtocols: any) => syncProtocols.parallelMidnight,
        () => ({
          name: "primitive_midnight-data",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress:
            "83aa8a4f4dec0d401c96a33e07272cb0f3399e241b416d536a5ab658f7d6a17a",
          stateMachinePrefix: "event_midnight",
          contract: { ledger: (data: any) => data },
          networkId: "mainnet",
        }),
      );
    }
    return p;
  })
  .build();

const syncInfo = toSyncProtocolWithNetwork(config);

// ---------------------------------------------------------------------------
// Step 4: Run engine, wait for target block, measure time
// ---------------------------------------------------------------------------
try {
  console.log("Step 4: Starting main...");
  await main(function* () {
    console.log("Step 4.1: Initializing...");
    yield* init();

    const dbConn = getConnection();
    console.log("Step 4.2: Getting connection...");
    const stats = {
      samples: [] as { wall: number; blockHeight: number }[],
    };

    // Spawn the engine inside static config context
    yield* spawn(function* () {
      yield* withEffectstreamStaticConfig(config, function* () {
        console.log("Step 4.3: Starting engine...");
        yield* start({
          appName: "perf-test",
          appVersion: "1.0.0",
          syncInfo,
        });
      });
    });

    // Wait for migrations and initial sync
    yield* sleep(3_000);

    console.log(`=== Benchmark: finalize ${NTP_BLOCK_COUNT} blocks ===\n`);

    const benchStart = Date.now();
    let firstBlockWall: number | undefined;
    let lastBlockHeight = 0;
    const deadline = Date.now() + TIMEOUT_S * 1000;

    while (Date.now() < deadline) {
      yield* sleep(500);

      let result;
      try {
        result = yield* call(() =>
          dbConn.query(`
            SELECT block_height
            FROM effectstream.effectstream_blocks
            WHERE effectstream_block_hash IS NOT NULL
            ORDER BY block_height DESC
            LIMIT 1
          `)
        );
      } catch {
        continue;
      }

      if (!result.rows.length) continue;

      const blockHeight = result.rows[0].block_height as number;

      if (blockHeight > 0 && firstBlockWall == null) {
        firstBlockWall = Date.now();
      }

      if (blockHeight !== lastBlockHeight) {
        stats.samples.push({ wall: Date.now(), blockHeight });
        const elapsed = (Date.now() - (firstBlockWall ?? benchStart)) / 1000;
        const rate = blockHeight / Math.max(elapsed, 0.001);
        console.log(
          `  block ${blockHeight}/${NTP_BLOCK_COUNT} | ` +
            `${rate.toFixed(1)} blocks/s | ` +
            `${elapsed.toFixed(1)}s elapsed`,
        );
        lastBlockHeight = blockHeight;
      }

      if (blockHeight >= NTP_BLOCK_COUNT) {
        break;
      }
    }

    const benchEnd = Date.now();
    console.log();

    // -----------------------------------------------------------------------
    // Report
    // -----------------------------------------------------------------------
    console.log("=== RESULTS ===\n");

    if (lastBlockHeight < NTP_BLOCK_COUNT) {
      console.log(
        `TIMEOUT: only finalized ${lastBlockHeight}/${NTP_BLOCK_COUNT} blocks in ${TIMEOUT_S}s\n`,
      );
    }

    const processingMs = firstBlockWall != null
      ? benchEnd - firstBlockWall
      : benchEnd - benchStart;

    console.log(`Blocks finalized: ${lastBlockHeight}`);
    console.log(`Processing time:  ${(processingMs / 1000).toFixed(2)}s`);
    console.log(`Avg blocks/sec:   ${(lastBlockHeight / (processingMs / 1000)).toFixed(2)}`);
    console.log(`Avg ms/block:     ${(processingMs / lastBlockHeight).toFixed(1)}`);
    console.log();
    console.log(
      `Chain time:       ${NTP_BLOCK_COUNT}s → processed in ${(processingMs / 1000).toFixed(1)}s`,
    );
    console.log(
      `Catchup ratio:    ${((NTP_BLOCK_COUNT * 1000) / processingMs).toFixed(2)}x realtime`,
    );

    yield* call(() => dbConn.end());
  });
} finally {
  if (pgliteProcess) {
    try {
      pgliteProcess.kill("SIGTERM");
    } catch { /* already dead */ }
  }
}
