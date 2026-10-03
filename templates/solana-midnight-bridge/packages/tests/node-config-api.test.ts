// Native tests for the node's sync configuration and its read-only API.
// No chain, no ports: the API runs on Fastify's `inject` over in-process PGLite.
//
// Run: bun test ./node-config-api.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { run } from "effection";
import { acquireDBMutex, releaseDBMutex } from "@effectstream/db";
import { toSyncProtocolWithNetwork } from "@effectstream/config";
import {
  buildBridgeConfig,
  loadBridgeNodeSettings,
  type BridgeNodeSettings,
} from "@solana-midnight-bridge/node/config";
import { apiRouter, NOT_MIGRATED_ERROR, parseTransferId } from "@solana-midnight-bridge/node/api";
import { asConnection, freshDb } from "./helpers/pglite-db.ts";

const mint = Keypair.generate().publicKey;
const programId = Keypair.generate().publicKey.toBase58();
const mintHex = Buffer.from(mint.toBytes()).toString("hex");

function deploymentFile(overrides: { midnight?: Record<string, unknown> | null; solana?: Record<string, unknown> } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-node-"));
  const file = path.join(dir, "devnet-stagenet.json");
  const solana = {
    cluster: "devnet", rpcUrl: "https://api.devnet.solana.com", programId, mint: mint.toBase58(), mintDecimals: 6,
    config: "c", authority: "a", vault: "v", operator: Keypair.generate().publicKey.toBase58(),
    startSlot: 123456, signatures: {}, updatedAt: new Date().toISOString(), ...overrides.solana,
  };
  const midnight = overrides.midnight === null ? undefined : {
    networkId: "stagenet", contractAddress: "ab".repeat(32), tokenColor: "cd".repeat(32), sourceMint: mintHex,
    networkTag: "ef".repeat(32), operator: solana.operator, operatorKey: { x: "1", y: "2" }, startBlockHeight: 777,
    indexer: "https://indexer.stagenet.shielded.tools", updatedAt: new Date().toISOString(), ...overrides.midnight,
  };
  fs.writeFileSync(file, JSON.stringify({ solana, ...(midnight ? { midnight } : {}) }));
  return file;
}

describe("loadBridgeNodeSettings (live)", () => {
  const saved = process.env.BRIDGE_DEPLOYMENT;
  afterEach(() => {
    if (saved === undefined) delete process.env.BRIDGE_DEPLOYMENT;
    else process.env.BRIDGE_DEPLOYMENT = saved;
  });

  test("reads both sections and picks devnet + stagenet endpoints", () => {
    process.env.BRIDGE_DEPLOYMENT = deploymentFile();
    const s = loadBridgeNodeSettings("live");
    expect(s.solana.programId).toBe(programId);
    expect(s.solana.startSlot).toBe(123456);
    expect(s.midnight.startBlockHeight).toBe(777);
    expect(s.midnightUrls.id).toBe("stagenet");
    expect(s.solanaNetworkId).toBe("devnet");
    expect(s.solanaSync.confirmationDepth).toBe(32);
  });

  test("refuses a deployment without the midnight section", () => {
    process.env.BRIDGE_DEPLOYMENT = deploymentFile({ midnight: null });
    expect(() => loadBridgeNodeSettings("live")).toThrow(/no "midnight" section/);
  });

  test("refuses a contract that seals another SPL mint", () => {
    process.env.BRIDGE_DEPLOYMENT = deploymentFile({ midnight: { sourceMint: "00".repeat(32) } });
    expect(() => loadBridgeNodeSettings("live")).toThrow(/another SPL mint/);
  });

  test("refuses a deployment for another Midnight network", () => {
    process.env.BRIDGE_DEPLOYMENT = deploymentFile({ midnight: { networkId: "preprod" } });
    expect(() => loadBridgeNodeSettings("live")).toThrow(/is for Midnight network preprod/);
  });

  test("live mode on another network (PR-2 T7 stand-ins): network id and endpoints from the environment", () => {
    const keys = ["MIDNIGHT_NETWORK_ID", "MIDNIGHT_INDEXER_HTTP", "MIDNIGHT_INDEXER_WS", "MIDNIGHT_NODE_HTTP", "SOLANA_DEVNET_RPC_URL"] as const;
    const env0 = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      process.env.BRIDGE_DEPLOYMENT = deploymentFile({
        solana: { cluster: "custom", rpcUrl: "http://solana-validator:8899" },
        midnight: { networkId: "undeployed", indexer: "http://midnight-indexer:8088" },
      });
      // Without MIDNIGHT_NETWORK_ID the node targets stagenet and refuses the file.
      expect(() => loadBridgeNodeSettings("live")).toThrow(/is for Midnight network undeployed, the node targets stagenet/);
      // Another network never falls back to the stagenet endpoints.
      process.env.MIDNIGHT_NETWORK_ID = "undeployed";
      expect(() => loadBridgeNodeSettings("live")).toThrow(/MIDNIGHT_NETWORK_ID=undeployed needs MIDNIGHT_INDEXER_HTTP, MIDNIGHT_INDEXER_WS, MIDNIGHT_NODE_HTTP/);
      process.env.MIDNIGHT_INDEXER_HTTP = "http://midnight-indexer:8088/api/v4/graphql";
      process.env.MIDNIGHT_INDEXER_WS = "ws://midnight-indexer:8088/api/v4/graphql/ws";
      process.env.MIDNIGHT_NODE_HTTP = "http://midnight-node:9944";
      process.env.SOLANA_DEVNET_RPC_URL = "http://solana-validator:8899";
      const s = loadBridgeNodeSettings("live");
      expect(s.midnightUrls.id).toBe("undeployed");
      expect(s.midnightUrls.indexer).toBe("http://midnight-indexer:8088/api/v4/graphql");
      expect(s.midnightUrls.node).toBe("http://midnight-node:9944");
      expect(s.solanaRpcUrl).toBe("http://solana-validator:8899");
      // A custom cluster is labelled localnet for the sync config; devnet keeps its name.
      expect(s.solanaNetworkId).toBe("localnet");
      // Live sync settings are unchanged (devnet-tuned, product depth 32).
      expect(s.solanaSync.confirmationDepth).toBe(32);
      process.env.MIDNIGHT_NETWORK_ID = "mainnet";
      expect(() => loadBridgeNodeSettings("live")).toThrow(/mainnet/);
      process.env.MIDNIGHT_NETWORK_ID = "Stage Net";
      expect(() => loadBridgeNodeSettings("live")).toThrow(/not a Midnight network id/);
    } finally {
      for (const k of keys) {
        if (env0[k] === undefined) delete process.env[k];
        else process.env[k] = env0[k];
      }
    }
  });
});

describe("buildBridgeConfig", () => {
  test("NTP main + Solana and Midnight parallel syncs with one primitive each, from the deployment heights", () => {
    process.env.BRIDGE_DEPLOYMENT = deploymentFile();
    const s: BridgeNodeSettings = loadBridgeNodeSettings("live");
    delete process.env.BRIDGE_DEPLOYMENT;
    const config = buildBridgeConfig(s, Date.now() - 60_000);
    const sync = toSyncProtocolWithNetwork(config) as any;
    const text = JSON.stringify(config, (_k, v) => (typeof v === "function" ? "[fn]" : typeof v === "bigint" ? v.toString() : v));
    expect(text).toContain(programId);
    expect(text).toContain("ab".repeat(32));
    expect(text).toContain('"startBlockHeight":123456');
    expect(text).toContain('"startBlockHeight":777');
    expect(text).toContain("bridge-solana-log");
    expect(text).toContain("bridge-midnight-state");
    expect(sync).toBeTruthy();
    // The Generic primitive decodes through ledgerFromTxStateHex (P0 S2).
    const prim = (config as any).primitives?.parallelMidnight ?? (config as any).primitives;
    expect(JSON.stringify(prim, (_k, v) => (typeof v === "function" ? "[fn]" : v))).toContain("ledgerFromTxStateHex");
  });
});

describe("API", () => {
  let db: PGlite;
  let server: ReturnType<typeof fastify>;
  beforeEach(async () => {
    db = await freshDb();
    await db.exec(`
      INSERT INTO bridge_transfers (direction, source_id, amount, recipient, sender, status, src_ref, observed_block)
        VALUES ('s2m', 0, 10, 'aa', 'dep', 'observed', 'solana-slot:5', 10),
               ('s2m', 1, 7, 'bb', 'dep', 'observed', 'solana-slot:6', 11),
               ('m2s', 0, 4, 'Owner1111', NULL, 'completed', 'midnight-block:12', 12);
      INSERT INTO relayer_jobs (direction, source_id, submitted_at, attempts, last_attempt_at, last_tx)
        VALUES ('s2m', 1, NOW(), 2, NOW(), '00abc');
    `);
    server = fastify();
    await apiRouter(server as any, asConnection(db) as any);
    await server.ready();
  });
  afterEach(async () => {
    await server.close();
  });

  const get = async (url: string) => {
    const r = await server.inject({ method: "GET", url });
    return { code: r.statusCode, body: r.json() as any };
  };

  test("GET /transfers lists every transfer with its derived status", async () => {
    const { code, body } = await get("/transfers");
    expect(code).toBe(200);
    const byId = Object.fromEntries(body.transfers.map((t: any) => [t.id, t.status]));
    expect(byId).toEqual({ "s2m:0": "observed", "s2m:1": "submitted", "m2s:0": "completed" });
  });

  test("filters by direction and status", async () => {
    expect((await get("/transfers?direction=m2s")).body.transfers.map((t: any) => t.id)).toEqual(["m2s:0"]);
    expect((await get("/transfers?status=submitted")).body.transfers.map((t: any) => t.id)).toEqual(["s2m:1"]);
    expect((await get("/transfers?direction=s2m&status=completed")).body.transfers).toEqual([]);
  });

  test("GET /transfers/:id returns one transfer with its relayer info", async () => {
    const { code, body } = await get("/transfers/s2m:1");
    expect(code).toBe(200);
    expect(body.transfer).toMatchObject({ id: "s2m:1", amount: "7", status: "submitted", relayer: { attempts: 2, lastTx: "00abc" } });
    expect((await get("/transfers/s2m:0")).body.transfer.relayer).toBeNull();
  });

  test("bad input is a 400, a missing transfer a 404", async () => {
    expect((await get("/transfers?direction=x")).code).toBe(400);
    expect((await get("/transfers?status=done")).code).toBe(400);
    expect((await get("/transfers/abc")).code).toBe(400);
    expect((await get("/transfers/s2m:99")).code).toBe(404);
  });

  test("parseTransferId accepts u64 ids only", () => {
    expect(parseTransferId("m2s:18446744073709551615")).toEqual({ direction: "m2s", sourceId: "18446744073709551615" });
    expect(parseTransferId("m2s:18446744073709551616")).toBeNull();
    expect(parseTransferId("s2m:01")).toBeNull();
  });
});

// T6 F-T6.2: the runtime serves the API before it applies this template's
// migrations, and `runPreparedQuery` starts the query before it waits for the
// PGLite mutex. A request in that window used to fail while waiting, with no
// handler on the rejection: the runtime's unhandledRejection handler then
// exited the node (the first full-stack run died 23 s after start).
describe("API before the template's migrations (F-T6.2)", () => {
  test("GET /transfers while bridge_transfers does not exist and the DB mutex is busy: 503, no unhandled rejection", async () => {
    const db = new PGlite(); // no migrations: bridge_transfers does not exist
    const server = fastify();
    await apiRouter(server as any, asConnection(db) as any);
    await server.ready();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      // Hold the runtime's DB mutex, as the sync does while it processes a block.
      await run(() => acquireDBMutex("f-t6-2-holder"));
      const pending = server.inject({ method: "GET", url: "/transfers" });
      const pendingOne = server.inject({ method: "GET", url: "/transfers/s2m:0" });
      await Bun.sleep(500); // both queries fail while their routes wait for the mutex
      releaseDBMutex("f-t6-2-holder");
      const [r, r1] = await Promise.all([pending, pendingOne]);
      await Bun.sleep(50);
      expect(unhandled.map((u) => String((u as Error)?.message ?? u))).toEqual([]);
      expect(r.statusCode).toBe(503);
      expect(r.json() as unknown).toEqual({ error: NOT_MIGRATED_ERROR });
      expect(r1.statusCode).toBe(503);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      await server.close();
      await db.close();
    }
  });
});
