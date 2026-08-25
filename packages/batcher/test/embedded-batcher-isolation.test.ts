// SC-010: the embedded development rung, measured (spec Addendum B).
//
// Three claims, none of which can be argued from the source alone:
//
//   1. Two embedded batchers with two directories run completely independent
//      lifecycles. This is the SC-007 shape, with the isolation boundary moved
//      from a schema to a directory.
//   2. Two embedded batchers pointed at ONE directory fail loudly rather than
//      corrupting it. PgLite does NOT lock its data directory — measured, see
//      F-P7.7 — so the batcher owns that lock, and this is where it is proven.
//   3. The embedded engine binds NO network socket. That is the claim that
//      makes "N batchers on one host need no port coordination" true, and it
//      is asserted here by enumerating this process's listening sockets, not
//      by reading the PgLite README.
//
// No database server, no Docker, no ports: the whole point of the rung.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import { DatabaseStorage } from "../core/storage.ts";
import type { Batcher } from "../core/batcher.ts";
import type { BatcherStorage, DefaultBatcherInput } from "../core/mod.ts";

// Deliberately the SAME target on both sides: `paimaL2` is shared by four
// products in this repository, so two dev batchers really do collide by name.
const TARGET = "paimaL2";

// Read once — the admission window refuses stale signed timestamps, and
// re-reading the clock per input would change the request id.
const NOW = Date.now();

const ENV_KEYS = ["BATCHER_PGLITE", "BATCHER_PGLITE_DATA_DIR", "BATCHER_DB_SCHEMA"];
let savedEnv: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key]!;
  }
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempDir(tag: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `batcher-embedded-${tag}-`));
  tempDirs.push(dir);
  return dir;
}

const input = (nonce: string): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-shared",
  input: JSON.stringify({ nonce }),
  timestamp: String(NOW),
  signature: `0xsignature-${nonce}`,
  target: TARGET,
});

const confirmingAdapter = (hash: string) => ({
  verifySignature: () => true,
  validateInput: () => ({ valid: true }),
  buildBatchData: (inputs: DefaultBatcherInput[]) =>
    inputs.length === 0 ? null : { selectedInputs: inputs, data: { inputs } },
  estimateBatchFee: () => 0n,
  submitBatch: async (data: { inputs: DefaultBatcherInput[] }) => ({
    hash,
    submitted: data.inputs,
  }),
  waitForTransactionReceipt: async () => ({ hash, blockNumber: 7n, status: 1 }),
  getAccountAddress: () => "scripted",
  getChainName: () => "scripted",
  isReady: () => true,
  getBlockNumber: async () => 7n,
});

const storageOf = (batcher: Batcher<DefaultBatcherInput>): BatcherStorage =>
  (batcher as unknown as { storage: BatcherStorage }).storage;

/**
 * Build a batcher THROUGH the environment ladder, not by handing it a storage.
 *
 * That is the path a developer actually takes, and the only one that proves
 * the two keys do what the docs say they do.
 */
function embeddedBatcher(dataDirectory: string, hash: string) {
  process.env.BATCHER_PGLITE = "true";
  process.env.BATCHER_PGLITE_DATA_DIR = dataDirectory;
  const batcher = createNewBatcher({
    pollingIntervalMs: 1_000_000,
    enableHttpServer: false,
    enableEventSystem: false,
  }, undefined);
  batcher.addBlockchainAdapter(TARGET, confirmingAdapter(hash) as any, {
    criteriaType: "size",
    maxBatchSize: 1_000_000,
  });
  return batcher;
}

async function shutdown(batcher: Batcher<DefaultBatcherInput>): Promise<void> {
  await (batcher as any).gracefulShutdown().catch(() => {});
  await storageOf(batcher).close?.().catch(() => {});
}

describe("two embedded batchers, two directories", () => {
  test("independent lifecycles, zero interference", async () => {
    const leftDir = tempDir("left");
    const rightDir = tempDir("right");

    const left = embeddedBatcher(leftDir, "0xleft");
    const right = embeddedBatcher(rightDir, "0xright");
    try {
      await left.init({ startPolling: false });
      await right.init({ startPolling: false });

      // Each batcher tracks: this rung is not the queue-only fallback.
      expect(left.isRequestTrackingEnabled()).toBe(true);
      expect(right.isRequestTrackingEnabled()).toBe(true);
      expect(existsSync(path.join(leftDir, "pglite"))).toBe(true);
      expect(existsSync(path.join(rightDir, "pglite"))).toBe(true);

      // Byte-identical submissions — same address, timestamp, signature and
      // target — so every identity the batcher computes matches on both sides.
      // Only the directory differs.
      const payload = input("shared");
      const a = await left.batchInput(payload, "no-wait");
      const b = await right.batchInput(payload, "no-wait");

      expect(a.requestId).toBe(b.requestId);
      expect(a.duplicate ?? false).toBe(false);
      expect(b.duplicate ?? false).toBe(false);
      expect((await storageOf(left).getAllInputs()).length).toBe(1);
      expect((await storageOf(right).getAllInputs()).length).toBe(1);

      // Dedup still fires WITHIN one directory — the isolation did not switch
      // replay protection off, it scoped it.
      const again = await left.batchInput(payload, "no-wait");
      expect(again.duplicate).toBe(true);
      expect(again.requestId).toBe(a.requestId);
      expect((await storageOf(left).getAllInputs()).length).toBe(1);

      // Full lifecycle on the LEFT only: accept → terminal → poll.
      await left.forceProcessBatches();

      const leftStatus = await left.getRequestStatus(a.requestId);
      expect(leftStatus?.state).toBe("confirmed");
      expect(leftStatus?.transactionHash).toBe("0xleft");

      // The right batcher holds the SAME id and has heard nothing about it.
      const rightStatus = await right.getRequestStatus(b.requestId);
      expect(rightStatus?.state).toBe("queued");
      expect(rightStatus?.transactionHash).toBeUndefined();

      // The left batch consumed only its own row.
      expect((await storageOf(left).getAllInputs()).length).toBe(0);
      expect((await storageOf(right).getAllInputs()).length).toBe(1);

      // And the right one now runs its own lifecycle to a different chain
      // verdict, without disturbing the left's record.
      await right.forceProcessBatches();
      const rightFinal = await right.getRequestStatus(b.requestId);
      expect(rightFinal?.state).toBe("confirmed");
      expect(rightFinal?.transactionHash).toBe("0xright");
      expect((await left.getRequestStatus(a.requestId))?.transactionHash).toBe(
        "0xleft",
      );

      // Neither directory grew the other's database.
      expect(readdirSync(leftDir).sort()).toEqual(readdirSync(rightDir).sort());
    } finally {
      await shutdown(right);
      await shutdown(left);
    }
  }, 300_000);
});

describe("two embedded batchers, ONE directory", () => {
  test("the second refuses loudly, and the first keeps working", async () => {
    // PgLite does not lock its data directory (F-P7.7): left alone, both
    // instances open, diverge, and flush their own copy of the filesystem
    // over each other — the directory afterwards fails to open at all with a
    // unique-constraint violation. So the refusal below is the batcher's, and
    // it is the only thing standing between a developer and silent data loss.
    const shared = tempDir("shared");

    const first = embeddedBatcher(shared, "0xfirst");
    let second: Batcher<DefaultBatcherInput> | undefined;
    try {
      await first.init({ startPolling: false });
      await first.batchInput(input("first"), "no-wait");
      expect((await storageOf(first).getAllInputs()).length).toBe(1);

      second = embeddedBatcher(shared, "0xsecond");
      let message = "";
      try {
        await second.init({ startPolling: false });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      // Loud: it names the directory, the variable that changes it, and the
      // process already holding it.
      expect(message).not.toBe("");
      expect(message).toContain(shared);
      expect(message).toContain("BATCHER_PGLITE_DATA_DIR");
      expect(message).toContain(String(process.pid));

      // And nothing was corrupted: the first batcher still reads its row and
      // can still drive it to a terminal state.
      expect((await storageOf(first).getAllInputs()).length).toBe(1);
      await first.forceProcessBatches();
      expect((await storageOf(first).getAllInputs()).length).toBe(0);
    } finally {
      if (second) await shutdown(second);
      await shutdown(first);
    }
  }, 300_000);

  test("the lock is released on close, so a restart reuses the directory", async () => {
    // A guard that survived its owner would turn every crash into a manual
    // cleanup, which is a worse bug than the one it prevents.
    const dir = tempDir("restart");

    const first = embeddedBatcher(dir, "0xfirst");
    await first.init({ startPolling: false });
    const accepted = await first.batchInput(input("restart"), "no-wait");
    await shutdown(first);

    const second = embeddedBatcher(dir, "0xsecond");
    try {
      await second.init({ startPolling: false });
      const rows = await storageOf(second).getAllInputs();
      expect(rows.length).toBe(1);
      expect((await second.getRequestStatus(accepted.requestId))?.state).toBe(
        "queued",
      );
    } finally {
      await shutdown(second);
    }
  }, 300_000);
});

// ---------------------------------------------------------------------------
// The no-socket assertion.
// ---------------------------------------------------------------------------

/** Linux exposes the mapping this measurement needs; elsewhere it is skipped. */
const HAS_PROC = existsSync("/proc/self/net/tcp") && existsSync("/proc/self/fd");

/** The socket inodes THIS process holds open, so the readings below are ours. */
function mySocketInodes(): Set<string> {
  const inodes = new Set<string>();
  for (const fd of readdirSync("/proc/self/fd")) {
    try {
      const match = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/self/fd/${fd}`));
      if (match) inodes.add(match[1]);
    } catch {
      // The fd was closed between listing the directory and reading the link.
    }
  }
  return inodes;
}

/**
 * Every TCP port this PROCESS is listening on.
 *
 * `/proc/net/tcp` is network-namespace wide, so a reading taken from it alone
 * would report the whole machine. Intersecting its LISTEN rows with the socket
 * inodes above is what makes the answer specific to this process — which is
 * the only reading that can say anything about a library loaded into it.
 */
function myListeningPorts(): number[] {
  const mine = mySocketInodes();
  const ports = new Set<number>();
  for (const file of ["/proc/self/net/tcp", "/proc/self/net/tcp6"]) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const columns = line.trim().split(/\s+/);
      // sl local_address rem_address st tx:rx tr:tm->when retrnsmt uid timeout inode
      if (columns.length < 10) continue;
      if (columns[3] !== "0A") continue; // TCP_LISTEN
      if (!mine.has(columns[9])) continue;
      ports.add(parseInt(columns[1].split(":")[1], 16));
    }
  }
  return [...ports].sort((a, b) => a - b);
}

/** Listening UNIX sockets this process owns — no port, but still a socket. */
function myListeningUnixSockets(): string[] {
  const mine = mySocketInodes();
  const found: string[] = [];
  let text = "";
  try {
    text = readFileSync("/proc/self/net/unix", "utf8");
  } catch {
    return found;
  }
  for (const line of text.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/);
    // Num RefCount Protocol Flags Type St Inode Path
    if (columns.length < 7) continue;
    if (columns[3] !== "00010000") continue; // SO_ACCEPTCON — a listener
    if (!mine.has(columns[6])) continue;
    found.push(columns[7] ?? "(unnamed)");
  }
  return found;
}

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

describe.if(HAS_PROC)("the embedded engine binds no network socket", () => {
  test("storage init and a full lifecycle add no listening socket at all", async () => {
    const dir = tempDir("nosocket");

    const before = myListeningPorts();
    const beforeUnix = myListeningUnixSockets();

    const batcher = embeddedBatcher(dir, "0xnosocket");
    try {
      await batcher.init({ startPolling: false });
      const accepted = await batcher.batchInput(input("nosocket"), "no-wait");
      await batcher.forceProcessBatches();
      expect((await batcher.getRequestStatus(accepted.requestId))?.state).toBe(
        "confirmed",
      );

      const after = myListeningPorts();
      const afterUnix = myListeningUnixSockets();

      expect(after.filter((port) => !before.includes(port))).toEqual([]);
      expect(afterUnix.filter((sock) => !beforeUnix.includes(sock))).toEqual([]);
    } finally {
      await shutdown(batcher);
    }
  }, 300_000);

  test("the instrument can see a socket when there is one", async () => {
    // Without this, the assertion above is a reading from a broken gauge. The
    // same helper, the same process, a socket deliberately opened: it must
    // show up, and disappear again when closed.
    const before = myListeningPorts();
    const port = await freePort();

    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    try {
      const during = myListeningPorts();
      expect(during.filter((p) => !before.includes(p))).toEqual([port]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(myListeningPorts().filter((p) => !before.includes(p))).toEqual([]);
  }, 60_000);

  test("the only port an embedded batcher opens is its own BATCHER_PORT", async () => {
    // The honest form of the claim: not "no sockets ever", but "no socket
    // beyond the HTTP server the operator asked for". That is what makes N
    // embedded batchers on one host a matter of N ports, not 2N.
    const dir = tempDir("httpport");
    const port = await freePort();

    const before = myListeningPorts();

    process.env.BATCHER_PGLITE = "true";
    process.env.BATCHER_PGLITE_DATA_DIR = dir;
    const batcher = createNewBatcher({
      pollingIntervalMs: 1_000_000,
      port,
      enableHttpServer: true,
      enableEventSystem: false,
    }, undefined);
    batcher.addBlockchainAdapter(TARGET, confirmingAdapter("0xhttp") as any, {
      criteriaType: "size",
      maxBatchSize: 1_000_000,
    });

    try {
      await batcher.init({ startPolling: false });
      expect(batcher.isRequestTrackingEnabled()).toBe(true);

      const during = myListeningPorts();
      expect(during.filter((p) => !before.includes(p))).toEqual([port]);
    } finally {
      await batcher.stopHttpServer().catch(() => {});
      await shutdown(batcher);
    }
  }, 300_000);
});

describe.if(HAS_PROC)("the embedded storage on its own", () => {
  test("a bare DatabaseStorage opens no socket either", async () => {
    // Same claim one layer down, so it cannot be an accident of how the
    // batcher happens to wire things up.
    const dir = tempDir("bare");
    const before = myListeningPorts();
    const storage = new DatabaseStorage<DefaultBatcherInput>(dir);
    try {
      await storage.init(TARGET);
      await storage.addInput(input("bare"), TARGET);
      expect((await storage.getAllInputs()).length).toBe(1);
      expect(myListeningPorts().filter((p) => !before.includes(p))).toEqual([]);
    } finally {
      await storage.close?.();
    }
  }, 300_000);
});
