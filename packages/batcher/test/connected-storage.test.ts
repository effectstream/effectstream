// Connected storage: the batcher joins a database it does not own
// (spec Addendum A, FR-012 / FR-014 / FR-016; SC-007, SC-008).
//
// The architecture ruling behind this file: PgLite is development-only, there
// is exactly ONE instance, and the launcher owns it behind a pg-gateway. The
// batcher must CONNECT — to that gateway in dev, to real Postgres in prod —
// never embed a second engine.
//
// WHAT THIS PHASE MEASURED, and why the file is shaped the way it is: that
// gateway gives NO session isolation. It forwards every client's protocol
// messages into ONE PgLite backend, so `SET search_path` on one connection
// repoints every other client of the same gateway — including the engine,
// whose next unqualified query then fails outright. So the two halves are:
//
//   * against the gateway (always runs): the batcher REFUSES to pin a schema,
//     the refusal explains itself, and the attempt leaves every other client's
//     session exactly as it found it;
//   * against real Postgres (`BATCHER_TEST_POSTGRES_URL`, the same opt-in the
//     storage-contract suite uses): the isolation and parity properties the
//     spec asks for, measured — because that is where they are real.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";

import { DatabaseStorage } from "../core/storage.ts";
import type { DatabaseConnectionConfig } from "../core/database-storage.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const GATEWAY_MODULE = "../../node-sdk/db/scripts/start-pglite.ts";

/** A free port above 10000, confirmed free by binding it and letting go. */
async function freePort(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = 10000 + Math.floor(Math.random() * 45000);
    const free = await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(candidate, "127.0.0.1", () => {
        probe.close(() => resolve(true));
      });
    });
    if (free) return candidate;
  }
  throw new Error("no free port above 10000 after 50 attempts");
}

interface Gateway {
  port: number;
  close: () => Promise<void>;
}

const savedEnv: Record<string, string | undefined> = {};
function setEnvForGateway(dataDir: string): void {
  for (const key of ["PGLITE", "PGLITE_DATA_DIR", "DB_USER", "DB_NAME"]) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  }
  process.env.PGLITE = "true";
  process.env.PGLITE_DATA_DIR = dataDir;
  process.env.DB_USER = "postgres";
  process.env.DB_NAME = "postgres";
}
function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function startGateway(dataDir: string, port?: number): Promise<Gateway> {
  setEnvForGateway(dataDir);
  const { startPglite } = await import(GATEWAY_MODULE);
  const handle = await startPglite(port ?? await freePort());
  return { port: handle.port, close: () => handle.close() };
}

/** Connection fields shaped exactly as the engine's `getConnection()` builds them. */
function gatewayConnection(port: number, max = 1): DatabaseConnectionConfig {
  return { host: "127.0.0.1", port, user: "postgres", database: "postgres", max };
}

const POSTGRES_URL = process.env.BATCHER_TEST_POSTGRES_URL;
function postgresConnection(max: number): DatabaseConnectionConfig {
  const url = new URL(POSTGRES_URL!);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    max,
  };
}

let gatewayDir: string;
let gateway: Gateway;

beforeAll(async () => {
  gatewayDir = mkdtempSync(path.join(tmpdir(), "batcher-gateway-"));
  gateway = await startGateway(path.join(gatewayDir, "pglite"));
});

afterAll(async () => {
  await gateway?.close();
  restoreEnv();
  rmSync(gatewayDir, { recursive: true, force: true });
});

const input = (overrides: Partial<DefaultBatcherInput> = {}): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: "payload",
  timestamp: String(Date.now()),
  signature: "sig-1",
  ...overrides,
} as DefaultBatcherInput);

/** A raw pg pool, standing in for "some other client of this database". */
async function otherClient(port: number): Promise<any> {
  const specifier = "pg";
  const pg: any = await import(specifier);
  const Pool = pg.Pool ?? pg.default?.Pool;
  const pool = new Pool({
    host: "127.0.0.1",
    port,
    user: "postgres",
    database: "postgres",
    max: 1,
  });
  pool.on("error", () => {});
  return pool;
}

describe("connected storage against the development gateway", () => {
  test("pinning a schema is REFUSED, and the refusal says why and what to do", async () => {
    const storage = new DatabaseStorage({
      connection: gatewayConnection(gateway.port),
      schema: "dev_attempt",
    });
    let message = "";
    try {
      await storage.init("paimaL2");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      await storage.close?.();
    }
    expect(message).toContain("ONE shared session");
    // Both remedies, because a refusal that does not say what to do instead is
    // just an outage with better prose.
    expect(message).toContain("BATCHER_DB_SCHEMA");
    expect(message).toContain("DB_HOST");
    expect(message).toContain(String(gateway.port));
  }, 120_000);

  test("the refusal leaves every other client's session untouched", async () => {
    // The whole point of refusing is to protect bystanders, so the check that
    // matters is not "did we stop" but "did we stop WITHOUT breaking the
    // engine on the way". A probe that used search_path as its canary would
    // corrupt the thing it exists to protect.
    const engine = await otherClient(gateway.port);
    try {
      await engine.query("CREATE TABLE IF NOT EXISTS engine_owned (id int)");
      await engine.query("INSERT INTO engine_owned VALUES (1)");
      const before = await engine.query("SELECT current_schema() AS s");

      const storage = new DatabaseStorage({
        connection: gatewayConnection(gateway.port),
        schema: "dev_bystander",
      });
      await expect(storage.init("paimaL2")).rejects.toThrow();
      await storage.close?.();

      const after = await engine.query("SELECT current_schema() AS s");
      expect(after.rows[0].s).toBe(before.rows[0].s);
      // And the engine's own unqualified query still resolves — the failure
      // mode this guard exists to prevent is exactly this one going missing.
      const rows = await engine.query(
        "SELECT count(*)::int AS c FROM engine_owned",
      );
      expect(rows.rows[0].c).toBe(1);
    } finally {
      await engine.end().catch(() => {});
    }
  }, 120_000);

  test("without a schema the connection is left exactly as it was", async () => {
    // Every pre-existing explicit construction keeps working: no schema means
    // no probe, no CREATE SCHEMA, no SET search_path, nothing to migrate.
    const storage = new DatabaseStorage({
      connection: gatewayConnection(gateway.port),
    });
    try {
      expect(storage.getSchema()).toBeUndefined();
      await storage.init("paimaL2");
      expect((await storage.describeConnection()).schema).toBe("public");
      await storage.addInput(input({ signature: "unpinned" }), "paimaL2");
      expect((await storage.getAllInputs()).length).toBe(1);
    } finally {
      await storage.close?.();
    }
  }, 120_000);

  test("a connected storage touches no filesystem", async () => {
    // FR-016. Before this, `./batcher-data` was probed even under a connection
    // string, so a connected deployment that happened to have an old queue
    // file beside it would import inputs nobody asked it to submit.
    //
    // Its own gateway, and this is not tidiness: the legacy import is ALSO
    // guarded on the queue table being empty, so against the shared gateway
    // (which has rows by the time this runs) the assertion would hold whether
    // or not FR-016 were implemented. A probe caught exactly that — the first
    // version of this test passed with the fix reverted.
    const cwd = process.cwd();
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-nofs-"));
    const local = await startGateway(path.join(dir, "gateway"));
    const storage = new DatabaseStorage({
      connection: gatewayConnection(local.port),
    });
    try {
      process.chdir(dir);
      mkdirSync("batcher-data", { recursive: true });
      writeFileSync(
        "batcher-data/pending-inputs.jsonl",
        JSON.stringify(input({ signature: "must-not-be-imported" })) + "\n",
      );

      await storage.init("paimaL2");

      expect(
        (await storage.getAllInputs()).some((row) =>
          row.signature === "must-not-be-imported"
        ),
      ).toBe(false);
      // Untouched: still there, not renamed to `.imported`.
      expect(existsSync("batcher-data/pending-inputs.jsonl")).toBe(true);
      expect(existsSync("batcher-data/pending-inputs.jsonl.imported")).toBe(
        false,
      );
      expect(existsSync("batcher-data/pglite")).toBe(false);
      // The queue table really is empty, which is what makes the assertion
      // above about FR-016 rather than about the import's emptiness guard.
      expect((await storage.getAllInputs()).length).toBe(0);
    } finally {
      await storage.close?.();
      process.chdir(cwd);
      await local.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  test("an EXPLICIT data directory is still imported when connected", async () => {
    // The other half of FR-016: the legacy import is not removed, it is made
    // deliberate. An operator migrating a FileStorage queue into a connected
    // batcher points at the directory and the rows walk across.
    //
    // Its own gateway, because the import is guarded on the queue table being
    // EMPTY (a second import would resubmit every input in the file). The
    // shared gateway above has rows in `public` by the time this runs, and a
    // skipped import would look identical to a broken one.
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-migrate-"));
    const local = await startGateway(path.join(dir, "gateway"));
    const storage = new DatabaseStorage({
      connection: gatewayConnection(local.port),
      dataDirectory: dir,
    });
    try {
      writeFileSync(
        path.join(dir, "pending-inputs.jsonl"),
        JSON.stringify(input({ signature: "migrated" })) + "\n",
      );
      await storage.init("paimaL2");
      const rows = await storage.getAllInputs();
      expect(rows.some((row) => row.signature === "migrated")).toBe(true);
      expect(rows.find((row) => row.signature === "migrated")?.target).toBe(
        "paimaL2",
      );
      expect(existsSync(path.join(dir, "pending-inputs.jsonl.imported"))).toBe(
        true,
      );
    } finally {
      await storage.close?.();
      await local.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  test("an unreachable database refuses init instead of degrading", async () => {
    // FR-012: a set schema declares intent. Falling back here would leave an
    // operator who believes tracking is on running without it.
    const dead = await freePort();
    const storage = new DatabaseStorage({
      connection: gatewayConnection(dead),
      schema: "iso_dead",
    });
    let message = "";
    try {
      await storage.init("paimaL2");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("Failed to initialize storage");
    expect(message).toMatch(/ECONNREFUSED|connect/i);
    // And it is still unusable afterwards — no silent local fallback.
    await expect(storage.getAllInputs()).rejects.toThrow();
  }, 120_000);

  test("connectionString and connection together are refused", () => {
    expect(() =>
      new DatabaseStorage({
        connectionString: "postgres://x/y",
        connection: gatewayConnection(gateway.port),
      })
    ).toThrow(/not both/);
  });

  test("an invalid schema is refused at construction, before anything connects", () => {
    expect(() =>
      new DatabaseStorage({
        connection: gatewayConnection(gateway.port),
        schema: "Not Valid",
      })
    ).toThrow(/BATCHER_DB_SCHEMA/);
  });

  test("a double-prefixed schema warns at construction", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    try {
      const storage = new DatabaseStorage({
        connection: gatewayConnection(gateway.port),
        schema: "batcher_twice",
      });
      expect(storage.getSchema()).toBe("batcher_batcher_twice");
    } finally {
      console.warn = original;
    }
    expect(warnings.join("\n")).toContain("batcher_batcher_twice");
  });
});

describe.if(!!POSTGRES_URL)("connected storage against real Postgres", () => {
  beforeAll(async () => {
    // A real server keeps what the last run left, and several cases here
    // assert on FIRST acceptance (`created: true`), which is only true against
    // a clean schema. Dropping by PREFIX is safe by construction: `batcher_`
    // is exactly the namespace this feature owns, which is the other reason
    // the prefix exists.
    const specifier = "pg";
    const pg: any = await import(specifier);
    const Pool = pg.Pool ?? pg.default?.Pool;
    const conn = postgresConnection(1);
    const pool = new Pool({ ...conn });
    pool.on("error", () => {});
    try {
      const existing = await pool.query(
        "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'batcher\\_%'",
      );
      for (const row of existing.rows) {
        await pool.query(`DROP SCHEMA IF EXISTS "${row.nspname}" CASCADE`);
      }
    } finally {
      await pool.end().catch(() => {});
    }
  });

  test("it creates its own schema and puts every table inside it", async () => {
    const storage = new DatabaseStorage({
      connection: postgresConnection(2),
      schema: "iso_tables",
    });
    try {
      await storage.init("paimaL2");
      expect(storage.getSchema()).toBe("batcher_iso_tables");
      expect((await storage.describeConnection()).schema).toBe(
        "batcher_iso_tables",
      );

      const rows = await (storage as any).db.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'batcher_iso_tables' ORDER BY table_name`,
      );
      const names = rows.rows.map((r: any) => r.table_name);
      expect(names).toContain("pending_inputs");
      expect(names).toContain("request_status");
      expect(names).toContain("replay_keys");

      // And nothing landed in public, where the engine's own tables live.
      const inPublic = await (storage as any).db.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('pending_inputs','request_status','replay_keys')`,
      );
      expect(inPublic.rows.length).toBe(0);
    } finally {
      await storage.close?.();
    }
  }, 120_000);

  test("every pooled connection resolves to the schema (distinct backends)", async () => {
    const storage = new DatabaseStorage({
      connection: postgresConnection(5),
      schema: "pg_pool",
    });
    try {
      await storage.init("paimaL2");
      // Distinct backend pids are what makes this more than one connection
      // reporting the same thing five times.
      const clients = await Promise.all(
        Array.from({ length: 5 }, () => storage.describeConnection()),
      );
      const pids = new Set(clients.map((c) => c.backendPid));
      for (const entry of clients) expect(entry.schema).toBe("batcher_pg_pool");
      expect(pids.size).toBeGreaterThan(1);
    } finally {
      await storage.close?.();
    }
  }, 120_000);

  test("a killed backend reconnects into the same schema", async () => {
    // SC-008's "including after a reconnect". If the search_path were applied
    // once at open() rather than per connection, the batcher would start
    // writing to `public` from the first reconnect onwards — silently.
    const storage = new DatabaseStorage({
      connection: postgresConnection(2),
      schema: "pg_reconnect",
    });
    try {
      await storage.init("paimaL2");
      await storage.addInput(input({ signature: "pg-before-kill" }), "paimaL2");
      try {
        await (storage as any).db.query(
          "SELECT pg_terminate_backend(pg_backend_pid())",
        );
      } catch {
        // Terminating your own backend surfaces as a connection error — that
        // IS the reconnect this test needs, not a failure.
      }
      let described: { schema: string | null } | undefined;
      for (let attempt = 0; attempt < 10 && !described; attempt++) {
        try {
          described = await storage.describeConnection();
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      expect(described?.schema).toBe("batcher_pg_reconnect");
      const rows = await storage.getAllInputs();
      expect(rows.map((r) => r.signature)).toContain("pg-before-kill");
    } finally {
      await storage.close?.();
    }
  }, 120_000);

  test("two schemas on ONE database with identical target names cannot see each other", async () => {
    // SC-007. The collision this prevents is real: `paimaL2` is the target
    // name used by four different products in this repo, so without schema
    // isolation two batchers would fetch each other's queue rows.
    const a = new DatabaseStorage({
      connection: postgresConnection(2),
      schema: "pg_left",
    });
    const b = new DatabaseStorage({
      connection: postgresConnection(2),
      schema: "pg_right",
    });
    const requestId = "b".repeat(64);
    try {
      await a.init("paimaL2");
      await b.init("paimaL2");

      const shared = input({ signature: "pg-same-bytes", address: "addr-shared" });
      const acceptedA = await a.recordAccepted!(
        requestId,
        shared,
        "paimaL2",
        "pg-replay",
      );
      const acceptedB = await b.recordAccepted!(
        requestId,
        shared,
        "paimaL2",
        "pg-replay",
      );

      // Same identity, two independent records: B is NOT a duplicate of A.
      expect(acceptedA.created).toBe(true);
      expect(acceptedB.created).toBe(true);
      expect(acceptedA.duplicate ?? false).toBe(false);
      expect(acceptedB.duplicate ?? false).toBe(false);

      // Queue rows: one each, not two on either side.
      expect((await a.getInputsByTarget("paimaL2", "paimaL2")).length).toBe(1);
      expect((await b.getInputsByTarget("paimaL2", "paimaL2")).length).toBe(1);

      // Statuses move independently.
      await a.recordTransition!(requestId, "confirmed", {
        transactionHash: "0xleft",
      });
      expect((await a.getStatus!(requestId))?.state).toBe("confirmed");
      expect((await b.getStatus!(requestId))?.state).toBe("queued");

      // Replay keys are per-schema: A's claim does not veto B's.
      expect((await a.findByReplayKey!("pg-replay"))?.state).toBe("confirmed");
      expect((await b.findByReplayKey!("pg-replay"))?.state).toBe("queued");

      // Removal on one side leaves the other alone.
      await a.removeProcessedInputs([shared], "paimaL2");
      expect((await a.getInputsByTarget("paimaL2", "paimaL2")).length).toBe(0);
      expect((await b.getInputsByTarget("paimaL2", "paimaL2")).length).toBe(1);
    } finally {
      await a.close?.();
      await b.close?.();
    }
  }, 180_000);

  test("real Postgres is NOT flagged as a shared session", async () => {
    // The guard's other side: a false positive here would make connected mode
    // impossible everywhere, which is a worse failure than the one it
    // prevents. Proven by the three tests above booting at all.
    const storage = new DatabaseStorage({
      connection: postgresConnection(2),
      schema: "pg_notshared",
    });
    try {
      await storage.init("paimaL2");
      expect((await storage.describeConnection()).schema).toBe(
        "batcher_pg_notshared",
      );
    } finally {
      await storage.close?.();
    }
  }, 120_000);
});
