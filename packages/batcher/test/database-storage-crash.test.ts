// Durability under kill -9.
//
// The batcher answers 200 as soon as the input is journaled, so the journal's
// promise is the whole contract: an input the storage said it committed must
// still be there after the power goes out. `FileStorage` bought that with
// atomic tmp+rename; `DatabaseStorage` inherits it from PgLite's WAL — inherits
// being the word that needs proving, because a WASM Postgres writing through an
// emulated filesystem is exactly where a durability claim goes quietly wrong.
//
// So: a child process writes inputs and reports each commit down a pipe, gets
// SIGKILLed mid-flight, and the parent re-opens the same directory and demands
// every reported row back.
//
// What this proves, precisely: a dead PROCESS loses nothing — the crash/restart,
// OOM-kill and redeploy cases, which is what the batcher actually meets. It also
// proves the unclean shutdown leaves a directory PgLite can still open, with no
// corruption, no stale lock and no manual recovery step; that was the real
// unknown behind putting a WASM Postgres on the accept path.
//
// What it does NOT prove: survival of a machine power cut. Verified by probe —
// re-running this test with `relaxedDurability: true` loses nothing either
// (3/3 runs), because SIGKILL leaves the kernel page cache intact, so no
// process-level test can tell fsync-durable from cache-durable. Testing that
// honestly needs a fault-injecting block device, not a signal.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseStorage } from "../core/database-storage.ts";

const WRITER = path.join(import.meta.dir, "fixtures", "crash-writer.ts");
/** Enough commits that the kill lands in the middle of a busy writer. */
const KILL_AFTER_COMMITS = 25;
const STARTUP_TIMEOUT_MS = 60_000;

describe("DatabaseStorage durability", () => {
  test("a killed writer loses nothing it reported as committed", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-crash-"));
    let storage: DatabaseStorage | undefined;
    try {
      const child = Bun.spawn(["bun", WRITER, dir], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const committed: number[] = [];
      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      const reader = child.stdout.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      while (committed.length < KILL_AFTER_COMMITS) {
        if (Date.now() > deadline) {
          child.kill(9);
          throw new Error(
            `crash-writer produced only ${committed.length} commits before the timeout`,
          );
        }
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^COMMITTED (\d+)$/.exec(line.trim());
          if (match) committed.push(Number(match[1]));
        }
      }

      // Kill without warning, mid-write: no close, no flush, no chance to
      // finish whatever statement is in flight.
      child.kill(9);
      await child.exited;
      await reader.cancel().catch(() => {});

      expect(committed.length).toBeGreaterThanOrEqual(KILL_AFTER_COMMITS);

      // Restart over the same directory.
      storage = new DatabaseStorage({ dataDirectory: dir });
      await storage.init("product-a");
      const rows = await storage.getAllInputs();

      // Nothing the writer was told was committed may be missing.
      const survived = new Set(rows.map((row) => row.timestamp));
      const lost = committed.filter((i) => !survived.has(String(i)));
      expect(lost).toEqual([]);

      // And nothing may come back half-written: every row is a whole input.
      for (const row of rows) {
        expect(row.address).toBe("addr-crash");
        expect(row.target).toBe("product-a");
        expect(row.input).toBe(`payload-${row.timestamp}`);
      }
      // A row can only exist once, even though the writer never got to
      // acknowledge the one it was in the middle of.
      expect(new Set(rows.map((r) => r.timestamp)).size).toBe(rows.length);
    } finally {
      await storage?.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
