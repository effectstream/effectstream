// AA 00064 P3: the node's Solana sync mode and poll interval (settings S1–S6),
// and the node starting its Solana sync in both modes. No chain, no ports: the
// engine builds its sync protocols from the template's config exactly as
// `start()` does (`genSyncProtocols`, over in-process PGLite), and one Solana
// pass runs against a mocked RPC.
//
// It needs the working-tree engine (program mode is not in a published
// @effectstream release yet): run it after ./link.sh (LINK_LOCAL=1).
//
// Run: bun test ./node-sync-mode.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { PGlite } from "@electric-sql/pglite";
import { run } from "effection";
import { toSyncProtocolWithNetwork } from "@effectstream/config";
import { genSyncProtocols } from "@effectstream/sync";
import {
  BLOCK_MODE_ONLY_SETTINGS,
  buildBridgeConfig,
  DEFAULT_SOLANA_POLL_MS,
  describeSettings,
  loadBridgeNodeSettings,
  parseSolanaPollMs,
  parseSolanaSyncMode,
  SOLANA_SYNC_PROTOCOL,
} from "@solana-midnight-bridge/node/config";
import { asConnection } from "./helpers/pglite-db.ts";

const mint = Keypair.generate().publicKey;
const programId = Keypair.generate().publicKey.toBase58();
const START_SLOT = 123456;

const ENV_KEYS = ["BRIDGE_DEPLOYMENT", "BRIDGE_SOLANA_SYNC_MODE", "BRIDGE_SOLANA_POLL_MS", "SOLANA_DEVNET_RPC_URL", "SOLANA_DEVNET_RPC_URL_FILE", ...BLOCK_MODE_ONLY_SETTINGS];
let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.BRIDGE_DEPLOYMENT = deploymentFile();
  process.env.SOLANA_DEVNET_RPC_URL = "http://solana-rpc.test:8899";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function deploymentFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-sync-mode-"));
  const file = path.join(dir, "devnet-stagenet.json");
  const operator = Keypair.generate().publicKey.toBase58();
  fs.writeFileSync(file, JSON.stringify({
    solana: {
      cluster: "devnet", rpcUrl: "https://api.devnet.solana.com", programId, mint: mint.toBase58(), mintDecimals: 6,
      config: "c", authority: "a", vault: "v", operator, startSlot: START_SLOT, signatures: {}, updatedAt: "2026-10-07T00:00:00Z",
    },
    midnight: {
      networkId: "stagenet", contractAddress: "ab".repeat(32), tokenColor: "cd".repeat(32),
      sourceMint: Buffer.from(mint.toBytes()).toString("hex"), networkTag: "ef".repeat(32), operator,
      operatorKey: { x: "1", y: "2" }, startBlockHeight: 777, indexer: "https://indexer.stagenet.shielded.tools",
      updatedAt: "2026-10-07T00:00:00Z",
    },
  }));
  return file;
}

const silent = () => {};

describe("S1/S2: BRIDGE_SOLANA_SYNC_MODE and BRIDGE_SOLANA_POLL_MS", () => {
  test("the mode: program by default live, block by default local; either can be chosen; anything else is refused", () => {
    expect(parseSolanaSyncMode(undefined, "live")).toBe("program");
    expect(parseSolanaSyncMode("", "live")).toBe("program");
    expect(parseSolanaSyncMode(undefined, "local")).toBe("block");
    expect(parseSolanaSyncMode(" block ", "live")).toBe("block");
    expect(parseSolanaSyncMode("program", "local")).toBe("program");
    expect(() => parseSolanaSyncMode("slots", "live")).toThrow(/BRIDGE_SOLANA_SYNC_MODE must be "program" or "block"/);
  });

  test("the poll: 6000 ms by default; an integer ≥ 1000 or the node refuses to start", () => {
    expect(DEFAULT_SOLANA_POLL_MS).toBe(6000);
    expect(parseSolanaPollMs(undefined)).toBe(6000);
    expect(parseSolanaPollMs("1000")).toBe(1000);
    expect(parseSolanaPollMs("10000")).toBe(10000);
    for (const bad of ["999", "0", "-6000", "6.5", "6s"]) expect(() => parseSolanaPollMs(bad)).toThrow(/at least 1000/);
  });

  test("live settings: program mode at 6 s, and the engine config carries mode + pollingInterval", () => {
    const s = loadBridgeNodeSettings("live", silent);
    expect(s.solanaSync).toMatchObject({ syncMode: "program", programPollMs: 6000, delayMs: 6000, maxSupportedTransactionVersion: 1 });
    const sp = solanaProtocol(s);
    expect(sp.syncProtocol).toMatchObject({ mode: "program", pollingInterval: 6000, delayMs: 6000, startBlockHeight: START_SLOT });
    expect(describeSettings(s)).toContain("solanaSync=program poll=6000ms");
  });

  test("BRIDGE_SOLANA_POLL_MS sets program mode's interval; BRIDGE_SOLANA_SYNC_MODE=block keeps today's block settings", () => {
    process.env.BRIDGE_SOLANA_POLL_MS = "10000";
    expect(solanaProtocol(loadBridgeNodeSettings("live", silent)).syncProtocol).toMatchObject({ mode: "program", pollingInterval: 10000 });
    process.env.BRIDGE_SOLANA_SYNC_MODE = "block";
    const b = loadBridgeNodeSettings("live", silent);
    expect(solanaProtocol(b).syncProtocol).toMatchObject({ mode: "block", pollingInterval: 4000, stepSize: 24, confirmationDepth: 32, getBlockConcurrency: 8 });
    expect(describeSettings(b)).toContain("solanaSync=block polling=4000ms step=24 depth=32");
  });

  test("S3: block-only settings warn once in program mode (and are ignored), never in block mode", () => {
    process.env.BRIDGE_SOLANA_POLLING_MS = "2000";
    process.env.BRIDGE_SOLANA_GETBLOCK_CONCURRENCY = "4";
    const warnings: string[] = [];
    loadBridgeNodeSettings("live", (m) => warnings.push(m));
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("ignores BRIDGE_SOLANA_POLLING_MS, BRIDGE_SOLANA_GETBLOCK_CONCURRENCY");
    process.env.BRIDGE_SOLANA_SYNC_MODE = "block";
    const blockWarnings: string[] = [];
    const s = loadBridgeNodeSettings("live", (m) => blockWarnings.push(m));
    expect(blockWarnings).toEqual([]);
    expect(solanaProtocol(s).syncProtocol).toMatchObject({ pollingInterval: 2000, getBlockConcurrency: 4 });
  });

  test("an invalid setting refuses to start", () => {
    process.env.BRIDGE_SOLANA_SYNC_MODE = "fast";
    expect(() => loadBridgeNodeSettings("live", silent)).toThrow(/BRIDGE_SOLANA_SYNC_MODE/);
    process.env.BRIDGE_SOLANA_SYNC_MODE = "program";
    process.env.BRIDGE_SOLANA_POLL_MS = "500";
    expect(() => loadBridgeNodeSettings("live", silent)).toThrow(/BRIDGE_SOLANA_POLL_MS/);
  });
});

function solanaProtocol(s: ReturnType<typeof loadBridgeNodeSettings>) {
  const config = buildBridgeConfig(s, Date.parse("2026-10-07T00:00:00Z"));
  const all = toSyncProtocolWithNetwork(config) as any[];
  return all.find((p) => p.syncProtocol.name === SOLANA_SYNC_PROTOCOL);
}

// ── the node starts its Solana sync in both modes ──

/** PGLite with the engine's resume-marker table (what `genSyncProtocols` reads at start). */
async function engineDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA effectstream;
    CREATE TABLE effectstream.sync_protocol_pagination (
      protocol_name TEXT NOT NULL, page_number INTEGER NOT NULL, page JSONB NOT NULL,
      PRIMARY KEY (protocol_name, page_number)
    );`);
  return db;
}

/** A mocked Solana RPC: answers by method, records the calls. */
function mockSolanaRpc(tip: number) {
  const calls: { method: string; params: any[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    if (!String(url).startsWith("http://solana-rpc.test")) throw new Error(`unexpected request to ${String(url)}`);
    const req = JSON.parse(String(init?.body));
    calls.push({ method: req.method, params: req.params });
    const result = (() => {
      switch (req.method) {
        case "getSlot": return tip;
        case "getBlockTime": return 1_791_294_238;
        case "getSignaturesForAddress": return [];
        case "getBlock": return { blockhash: `h${req.params[0]}`, blockTime: 1_791_294_238, blockHeight: null, parentSlot: req.params[0] - 1, transactions: [] };
        default: return null;
      }
    })();
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

async function startSolanaSync(db: PGlite) {
  const config = buildBridgeConfig(loadBridgeNodeSettings("live", silent), Date.parse("2026-10-07T00:00:00Z"));
  const protocols = await run(() => genSyncProtocols(asConnection(db) as never, toSyncProtocolWithNetwork(config)));
  return protocols.find((p) => p.name === SOLANA_SYNC_PROTOCOL)! as any;
}

async function onePass(state: any) {
  await run(function* () {
    const input = yield* state.stateToInput();
    expect(input).toBeTruthy();
    const data = yield* state.fetcher.readData(input, state, state.lastPage);
    yield* state.updateState(input, data);
  });
}

describe("the node starts its Solana sync in both modes (genSyncProtocols over the template's config)", () => {
  let db: PGlite;
  let rpc: ReturnType<typeof mockSolanaRpc>;
  const log = console.log;
  beforeEach(async () => {
    db = await engineDb();
    rpc = mockSolanaRpc(START_SLOT + 100);
    console.log = silent;
  });
  afterEach(async () => {
    console.log = log;
    rpc.restore();
    await db.close();
  });

  test("program mode (the live default): one poll = getSlot(finalized) + getBlockTime + getSignaturesForAddress(the deployment's program)", async () => {
    const solana = await startSolanaSync(db);
    expect(solana.mode).toBe("program");
    expect(solana.healthDetails()).toMatchObject({ mode: "program", programs: [programId], pollIntervalMs: 6000 });
    await onePass(solana);
    expect(rpc.calls.map((c) => c.method)).toEqual(["getSlot", "getBlockTime", "getSignaturesForAddress"]);
    expect(rpc.calls[0].params).toEqual([{ commitment: "finalized" }]);
    expect(rpc.calls[2].params[0]).toBe(programId);
    expect(solana.lastPage).toMatchObject({ own: START_SLOT + 100, cursor: { slot: START_SLOT - 1, signatures: [] } });
  });

  test("block mode (BRIDGE_SOLANA_SYNC_MODE=block): getSlot(confirmed) then getBlock per slot, as before", async () => {
    process.env.BRIDGE_SOLANA_SYNC_MODE = "block";
    const solana = await startSolanaSync(db);
    expect(solana.mode).toBe("block");
    await onePass(solana);
    expect(rpc.calls[0]).toEqual({ method: "getSlot", params: [{ commitment: "confirmed" }] });
    expect(rpc.calls.slice(1).every((c) => c.method === "getBlock")).toBe(true);
    expect(rpc.calls.length).toBe(1 + 24);
    expect(solana.lastPage.cursor).toBeUndefined();
  });

  test("a database synced in the other mode refuses to start (FR-007: a new database, no migration)", async () => {
    await db.query(
      `INSERT INTO effectstream.sync_protocol_pagination (protocol_name, page_number, page) VALUES ($1, $2, $3)`,
      [SOLANA_SYNC_PROTOCOL, START_SLOT + 5, JSON.stringify({ own: START_SLOT + 5, ownBlockNumber: START_SLOT + 5, root: 1 })],
    );
    await expect(startSolanaSync(db)).rejects.toThrow(/block-mode resume marker/);
    process.env.BRIDGE_SOLANA_SYNC_MODE = "block";
    await db.query(`UPDATE effectstream.sync_protocol_pagination SET page = $1`, [
      JSON.stringify({ own: START_SLOT + 5, ownBlockNumber: START_SLOT + 5, root: 1, cursor: { slot: START_SLOT + 5, signatures: ["s"] } }),
    ]);
    await expect(startSolanaSync(db)).rejects.toThrow(/program-mode resume marker/);
  });
});
