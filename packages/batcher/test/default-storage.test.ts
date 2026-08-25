// The default storage backend: the FR-012 ladder, measured as a boot matrix
// (spec Addendum A, SC-006).
//
// A default is not a detail here: almost nothing passes `storage` explicitly,
// so whatever the constructor picks is what every template, every dev loop and
// every deployment actually runs. The three outcomes that matter are that it
// BOOTS with no environment at all, that it CONNECTS when told to, and that it
// REFUSES — never quietly degrades — when it was told to and cannot.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import { DatabaseStorage, FileStorage } from "../core/storage.ts";
import type { Batcher } from "../core/batcher.ts";
import type { BatcherStorage, DefaultBatcherInput } from "../core/mod.ts";

const stubAdapter = () =>
  ({
    submitBatch: async () => "0xhash",
    estimateBatchFee: () => "0",
    buildBatchData: async () => null,
    getChainName: () => "stub",
  }) as unknown as Parameters<Batcher<DefaultBatcherInput>["addBlockchainAdapter"]>[1];

/** The default data directory is relative to the process, so the test moves. */
async function inTempCwd(fn: () => Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "batcher-default-storage-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    await fn();
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

const storageOf = (batcher: Batcher<DefaultBatcherInput>): BatcherStorage =>
  (batcher as unknown as { storage: BatcherStorage }).storage;

const ENV_KEYS = [
  "BATCHER_DB_SCHEMA",
  "BATCHER_PGLITE",
  "BATCHER_PGLITE_DATA_DIR",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PW",
  "DB_NAME",
  "PGLITE",
];
let savedEnv: Record<string, string | undefined> = {};
let warnings: string[] = [];
let originalWarn: typeof console.warn;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  delete process.env.BATCHER_DB_SCHEMA;
  delete process.env.BATCHER_PGLITE;
  delete process.env.BATCHER_PGLITE_DATA_DIR;
  warnings = [];
  originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.warn = originalWarn;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key]!;
  }
});

async function freePort(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = 10000 + Math.floor(Math.random() * 45000);
    const free = await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(candidate, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (free) return candidate;
  }
  throw new Error("no free port above 10000 after 50 attempts");
}

function newStubBatcher(storage?: BatcherStorage<DefaultBatcherInput>) {
  const batcher = createNewBatcher({
    pollingIntervalMs: 1000,
    enableHttpServer: false,
    enableEventSystem: false,
  }, storage);
  batcher.addBlockchainAdapter("only", stubAdapter());
  return batcher;
}

const POSTGRES_URL = process.env.BATCHER_TEST_POSTGRES_URL;

describe("default storage: the FR-012 ladder", () => {
  test("unset ⇒ FileStorage, and the banner names what is off and what turns it on", async () => {
    await inTempCwd(async () => {
      const batcher = newStubBatcher();
      const storage = storageOf(batcher);

      expect(storage).toBeInstanceOf(FileStorage);
      expect(batcher.isRequestTrackingEnabled()).toBe(false);
      expect(batcher.getRequestTrackingInfo()).toEqual({
        enabled: false,
        reason: "queue-only-storage",
        enableWith: "BATCHER_DB_SCHEMA",
        disabled: [
          "durable request tracking (GET /input-status/:requestId)",
          "replay/dedup protection against paying twice for one signed request",
          "status retention and boot reconciliation",
        ],
      });

      // FR-012b: impossible to miss, and actionable without reading source.
      const banner = warnings.join("\n");
      expect(banner).toContain("BATCHER_DB_SCHEMA");
      expect(banner).toContain("/input-status");
      expect(banner).toContain("replay/dedup");
      expect(banner).toContain("./batcher-data");
      expect(banner).toMatch(/development/i);
      expect(banner).toMatch(/Production deployments MUST set/);
    });
  });

  test("the fallback still batches, and adopts a queue left by any earlier version", async () => {
    // FR-017's claim in one assertion: with the variable unset, this is the
    // pre-#873 batcher. The file is READ IN PLACE, not migrated and not
    // renamed — there is no database for it to move into.
    await inTempCwd(async () => {
      mkdirSync("batcher-data", { recursive: true });
      writeFileSync(
        "batcher-data/pending-inputs.jsonl",
        JSON.stringify({
          addressType: 5,
          address: "addr-upgraded",
          input: "payload",
          timestamp: "1754350000000",
          signature: "sig-1",
        }) + "\n",
      );

      const batcher = newStubBatcher();
      const storage = storageOf(batcher);
      try {
        await batcher.init({ startPolling: false });
        const rows = await storage.getAllInputs();
        expect(rows.length).toBe(1);
        expect(rows[0].address).toBe("addr-upgraded");
        // Stamped with the target it was routed to, as FileStorage has always
        // done on init.
        expect(rows[0].target).toBe("only");
        expect(existsSync("batcher-data/pending-inputs.jsonl")).toBe(true);
        expect(existsSync("batcher-data/pending-inputs.jsonl.imported")).toBe(false);
        expect(existsSync("batcher-data/pglite")).toBe(false);
      } finally {
        await storage.close?.();
      }
    });
  }, 60_000);

  test("an empty value is unset", async () => {
    // The ENV class cannot tell "" from absent, and FR-012 says so explicitly.
    await inTempCwd(async () => {
      process.env.BATCHER_DB_SCHEMA = "";
      expect(storageOf(newStubBatcher())).toBeInstanceOf(FileStorage);
    });
  });

  test("set but invalid ⇒ construction refused, message names the variable", async () => {
    await inTempCwd(async () => {
      for (const bad of ["Chess", "chess-v2", "a".repeat(56), "chess v2"]) {
        process.env.BATCHER_DB_SCHEMA = bad;
        expect(() => newStubBatcher()).toThrow(/BATCHER_DB_SCHEMA/);
      }
    });
  });

  test("set but unreachable ⇒ init REFUSES and never falls back", async () => {
    // The row of SC-006 that matters most. A fallback here would hand an
    // operator who deliberately enabled tracking a batcher that silently
    // keeps no record of anything.
    await inTempCwd(async () => {
      process.env.BATCHER_DB_SCHEMA = "deadend";
      process.env.DB_HOST = "127.0.0.1";
      process.env.DB_PORT = String(await freePort());

      const batcher = newStubBatcher();
      const storage = storageOf(batcher);
      expect(storage).toBeInstanceOf(DatabaseStorage);

      let message = "";
      try {
        await batcher.init({ startPolling: false });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("Failed to initialize storage");

      // Still the connected backend: nothing swapped it for a local one, and
      // nothing on disk was created as a consolation prize.
      expect(storageOf(batcher)).toBe(storage);
      expect(existsSync("batcher-data")).toBe(false);
    });
  }, 60_000);

  test("an explicit storage argument means the environment is never consulted", async () => {
    // Proven with a value that would REFUSE if it were read — so this cannot
    // pass by the environment happening to be benign.
    await inTempCwd(async () => {
      process.env.BATCHER_DB_SCHEMA = "NOT A VALID SCHEMA";
      const explicit = new FileStorage<DefaultBatcherInput>("./explicit-data");
      const batcher = newStubBatcher(explicit);
      expect(storageOf(batcher)).toBe(explicit);
      expect(warnings.join("\n")).not.toContain("REQUEST TRACKING IS OFF");
    });
  });

  test("embedded PgLite is still available, but only by asking for it", async () => {
    // FR-015: never selected by environment, always available explicitly.
    await inTempCwd(async () => {
      const embedded = new DatabaseStorage<DefaultBatcherInput>("./standalone");
      const batcher = newStubBatcher(embedded);
      try {
        await batcher.init({ startPolling: false });
        expect(batcher.isRequestTrackingEnabled()).toBe(true);
        expect(existsSync("standalone/pglite")).toBe(true);
      } finally {
        await embedded.close?.();
      }
    });
  }, 120_000);

  test("the fallback creates its data directory at construction, as it did before #873", async () => {
    // Recorded rather than asserted away: #873's default (DatabaseStorage)
    // touched no disk until init(), and this restores the older behaviour
    // because FileStorage mkdirs in its constructor. FR-017 asks for
    // "identical to pre-#873", and this is part of what that means.
    await inTempCwd(async () => {
      expect(existsSync("batcher-data")).toBe(false);
      newStubBatcher();
      expect(existsSync("batcher-data")).toBe(true);
    });
  });
});

// SC-010: the embedded rung (spec Addendum B, FR-018/FR-019).
//
// Development needs request tracking too, and Phase 6 measured that it cannot
// come from the launcher's gateway: that server multiplexes every client onto
// ONE Postgres session, so a batcher pinning a schema there repoints the
// ENGINE. A private, in-process instance is the way out — the engine cannot be
// reached from it, because there is nothing to reach it WITH: no socket, no
// port, just a WASM library and a directory.
describe("default storage: the embedded rung", () => {
  test("BATCHER_PGLITE=true ⇒ embedded database at the default path, tracking on, no banner", async () => {
    await inTempCwd(async () => {
      process.env.BATCHER_PGLITE = "true";

      const batcher = newStubBatcher();
      const storage = storageOf(batcher) as DatabaseStorage;
      try {
        expect(storage).toBeInstanceOf(DatabaseStorage);
        // Embedded, not connected: it owns no schema, because a private
        // database has no one to isolate itself from.
        expect(storage.getSchema()).toBeUndefined();

        await batcher.init({ startPolling: false });

        expect(batcher.isRequestTrackingEnabled()).toBe(true);
        expect(batcher.getRequestTrackingInfo()).toEqual({ enabled: true });
        // Phase 1's layout, untouched: the engine lives in a subdirectory so
        // `initdb` never meets a foreign file (F-P1.5).
        expect(existsSync(path.join("batcher-data", "pglite"))).toBe(true);
        // The point of the whole rung: it is OFF, so the banner must not fire.
        expect(warnings.join("\n")).not.toContain("REQUEST TRACKING IS OFF");
      } finally {
        await storage.close?.();
      }
    });
  }, 120_000);

  test("BATCHER_PGLITE_DATA_DIR is honoured, and it is what separates two batchers", async () => {
    await inTempCwd(async () => {
      process.env.BATCHER_PGLITE = "true";
      process.env.BATCHER_PGLITE_DATA_DIR = "./somewhere-else";

      const batcher = newStubBatcher();
      const storage = storageOf(batcher) as DatabaseStorage;
      try {
        await batcher.init({ startPolling: false });
        expect(existsSync(path.join("somewhere-else", "pglite"))).toBe(true);
        // And nothing landed at the default path, which is what makes the
        // variable an isolation boundary rather than a suggestion.
        expect(existsSync("batcher-data")).toBe(false);
      } finally {
        await storage.close?.();
      }
    });
  }, 120_000);

  test("an empty BATCHER_PGLITE_DATA_DIR falls back to the default, it does not mean cwd", async () => {
    // The ENV class returns "" for an explicitly-empty string (F-P7.2), and ""
    // as a PgLite directory means the process's working directory — where
    // `initdb` would refuse, pointing nowhere near the variable that caused it.
    await inTempCwd(async () => {
      process.env.BATCHER_PGLITE = "true";
      process.env.BATCHER_PGLITE_DATA_DIR = "   ";

      const batcher = newStubBatcher();
      const storage = storageOf(batcher) as DatabaseStorage;
      try {
        await batcher.init({ startPolling: false });
        expect(existsSync(path.join("batcher-data", "pglite"))).toBe(true);
      } finally {
        await storage.close?.();
      }
    });
  }, 120_000);

  test("embedded mode still imports a legacy queue, exactly as Phase 1 built it", async () => {
    // The embedded rung reuses the existing engine rather than a new one, and
    // this is the assertion that says so: the JSONL beside the database is
    // adopted and renamed, which only Phase 1's import path does.
    await inTempCwd(async () => {
      process.env.BATCHER_PGLITE = "true";
      mkdirSync("batcher-data", { recursive: true });
      writeFileSync(
        "batcher-data/pending-inputs.jsonl",
        JSON.stringify({
          addressType: 5,
          address: "addr-legacy",
          input: "payload",
          timestamp: "1754350000000",
          signature: "sig-legacy",
        }) + "\n",
      );

      const batcher = newStubBatcher();
      const storage = storageOf(batcher) as DatabaseStorage;
      try {
        await batcher.init({ startPolling: false });
        const rows = await storage.getAllInputs();
        expect(rows.length).toBe(1);
        expect(rows[0].address).toBe("addr-legacy");
        expect(rows[0].target).toBe("only");
        expect(existsSync("batcher-data/pending-inputs.jsonl")).toBe(false);
        expect(existsSync("batcher-data/pending-inputs.jsonl.imported")).toBe(true);
      } finally {
        await storage.close?.();
      }
    });
  }, 120_000);

  test("BATCHER_PGLITE=false is the same as unset", async () => {
    await inTempCwd(async () => {
      process.env.BATCHER_PGLITE = "false";
      expect(storageOf(newStubBatcher())).toBeInstanceOf(FileStorage);
    });
  });

  test("both keys set ⇒ construction refused, naming BOTH and the choice", async () => {
    // FR-019's refusal, and the reason it is a refusal rather than a
    // precedence rule: a stray BATCHER_PGLITE left in a shell profile must
    // never quietly move a production batcher off its real database and onto
    // a local file nobody is watching.
    await inTempCwd(async () => {
      process.env.BATCHER_PGLITE = "true";
      process.env.BATCHER_DB_SCHEMA = "chess_v2";

      let message = "";
      expect(() => {
        try {
          newStubBatcher();
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
          throw error;
        }
      }).toThrow();

      expect(message).toContain("BATCHER_PGLITE");
      expect(message).toContain("BATCHER_DB_SCHEMA");
      // Actionable: it must say what to do, not merely that something is wrong.
      expect(message).toMatch(/unset/i);
      // And nothing was created on the way to refusing.
      expect(existsSync("batcher-data")).toBe(false);
    });
  });

  test("the ENGINE's PGLITE key selects nothing here", async () => {
    // FR-018, asserted rather than merely avoided. PGLITE describes the
    // ENGINE's database and is `true` by default in development, so a ladder
    // that consulted it would give an embedded database to every dev batcher
    // that never asked for one — and, worse, would do it silently.
    await inTempCwd(async () => {
      process.env.PGLITE = "true";
      delete process.env.BATCHER_PGLITE;

      const storage = storageOf(newStubBatcher());
      expect(storage).toBeInstanceOf(FileStorage);
      expect(storage).not.toBeInstanceOf(DatabaseStorage);
      expect(warnings.join("\n")).toContain("REQUEST TRACKING IS OFF");
      expect(existsSync(path.join("batcher-data", "pglite"))).toBe(false);
    });
  });

  test("PGLITE=true does not rescue an otherwise-refused configuration either", async () => {
    // The same claim from the other side: the engine key cannot switch the
    // both-set refusal off, because it takes no part in the decision at all.
    await inTempCwd(async () => {
      process.env.PGLITE = "true";
      process.env.BATCHER_PGLITE = "true";
      process.env.BATCHER_DB_SCHEMA = "chess_v2";
      expect(() => newStubBatcher()).toThrow(/BATCHER_PGLITE/);
    });
  });

  test("an explicit storage argument outranks even a refused environment", async () => {
    // FR-019's first rung. The both-set combination throws when the ladder is
    // consulted, so a construction that succeeds here proves the environment
    // was not read — it cannot pass by the environment happening to be benign.
    await inTempCwd(async () => {
      process.env.BATCHER_PGLITE = "true";
      process.env.BATCHER_DB_SCHEMA = "chess_v2";
      const explicit = new FileStorage<DefaultBatcherInput>("./explicit-data");
      const batcher = newStubBatcher(explicit);
      expect(storageOf(batcher)).toBe(explicit);
      expect(warnings.join("\n")).not.toContain("REQUEST TRACKING IS OFF");
    });
  });
});

describe.if(!!POSTGRES_URL)("default storage: connected boot", () => {
  test("set + valid + reachable ⇒ connected DatabaseStorage owning batcher_<value>", async () => {
    await inTempCwd(async () => {
      const url = new URL(POSTGRES_URL!);
      process.env.BATCHER_DB_SCHEMA = "ladder_ok";
      process.env.DB_HOST = url.hostname;
      process.env.DB_PORT = String(Number(url.port || 5432));
      process.env.DB_USER = decodeURIComponent(url.username);
      process.env.DB_PW = decodeURIComponent(url.password);
      process.env.DB_NAME = url.pathname.replace(/^\//, "");
      // Not the dev gateway: a real server, so a password and a real pool.
      process.env.PGLITE = "false";

      const batcher = newStubBatcher();
      const storage = storageOf(batcher) as DatabaseStorage;
      try {
        expect(storage).toBeInstanceOf(DatabaseStorage);
        expect(storage.getSchema()).toBe("batcher_ladder_ok");
        await batcher.init({ startPolling: false });

        expect(batcher.isRequestTrackingEnabled()).toBe(true);
        expect(batcher.getRequestTrackingInfo()).toEqual({ enabled: true });
        expect((await storage.describeConnection()).schema).toBe(
          "batcher_ladder_ok",
        );
        // Connected mode means no filesystem at all (FR-016).
        expect(existsSync("batcher-data")).toBe(false);
        // And no banner: tracking is ON.
        expect(warnings.join("\n")).not.toContain("REQUEST TRACKING IS OFF");
      } finally {
        await storage.close?.();
      }
    });
  }, 120_000);
});
