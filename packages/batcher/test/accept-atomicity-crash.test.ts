// Acceptance is ONE write — probed with a signal, not argued in a comment.
//
// The construction argument is simple: `recordAccepted` issues one database
// function call whose queue/status/replay work shares the function transaction,
// so there is no instant at which one exists without the other. Constructions
// like that are exactly where a WASM Postgres, a driver wrapper and an emulated
// filesystem get to disagree quietly, so this kills a writer mid-flight and
// asks the store what it kept.
//
// The detector is the reconciliation counter itself: `init()` reports how many
// queue rows it had to invent a status for, and how many in-flight statuses had
// no row. If the kill could tear the pair, at least one of those numbers would
// come back non-zero. Both must be zero.
//
// The kill lands at a DIFFERENT point of the write loop each round, and that is
// not decoration. Killing at a fixed point (say, immediately after the writer's
// last acknowledgement) hits the same phase of the loop every time; probed with
// a deliberately torn implementation — the two inserts split into two
// transactions — a single fixed-point kill missed the tear 3 runs out of 3.
// Staggering the delay catches it.
//
// Same honesty caveat as `database-storage-crash.test.ts`: SIGKILL leaves the
// kernel page cache intact, so this proves process-death atomicity (crash,
// OOM-kill, redeploy) and not machine power loss.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseStorage } from "../core/database-storage.ts";

const WRITER = path.join(import.meta.dir, "fixtures", "accept-crash-writer.ts");
/** Enough acceptances that the kill lands in the middle of a busy writer. */
const KILL_AFTER_ACCEPTS = 8;
/**
 * Extra milliseconds to let the writer run after its last acknowledgement, so
 * the signal arrives at a different phase of the write loop each round.
 */
const KILL_DELAYS_MS = [0, 2, 5, 9, 14, 20, 27, 35];
const STARTUP_TIMEOUT_MS = 60_000;

describe("acceptance atomicity", () => {
  test.each(KILL_DELAYS_MS)(
    "a writer killed %sms into its stride leaves no half-accepted request",
    async (killDelayMs) => {
    const dir = mkdtempSync(path.join(tmpdir(), "batcher-accept-crash-"));
    let storage: DatabaseStorage | undefined;
    try {
      const child = Bun.spawn(["bun", WRITER, dir], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const accepted: Array<{ index: string; requestId: string }> = [];
      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      const reader = child.stdout.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      while (accepted.length < KILL_AFTER_ACCEPTS) {
        if (Date.now() > deadline) {
          child.kill(9);
          throw new Error(
            `accept-crash-writer produced only ${accepted.length} acceptances before the timeout`,
          );
        }
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^ACCEPTED (\d+) ([0-9a-f]{64})$/.exec(line.trim());
          if (match) accepted.push({ index: match[1], requestId: match[2] });
        }
      }

      // No close, no flush, no chance to finish the statement in flight — and
      // at a different point of the loop than the round before.
      if (killDelayMs > 0) await Bun.sleep(killDelayMs);
      child.kill(9);
      await child.exited;
      await reader.cancel().catch(() => {});

      expect(accepted.length).toBeGreaterThanOrEqual(KILL_AFTER_ACCEPTS);

      storage = new DatabaseStorage({ dataDirectory: dir });
      await storage.init("product-a");

      // Nothing to reconcile means nothing was torn: every row that survived
      // brought its status with it, and every in-flight status still has its
      // row. The row the writer was mid-way through is either wholly there or
      // wholly absent, and either way it is a matched pair.
      expect(storage.getReconciliationReport()).toEqual({
        synthesizedFromRows: 0,
        orphanedStatuses: 0,
      });

      // And everything the writer was TOLD was accepted is still all three
      // pieces: the queue row, the status record, and the replay key that was
      // written in the same transaction.
      const rows = await storage.getAllInputs();
      const survivingTimestamps = new Set(rows.map((row) => row.timestamp));
      for (const { index, requestId } of accepted) {
        const status = await storage.getStatus(requestId);
        expect(`${index}:${status?.state}`).toBe(`${index}:queued`);
        expect(status?.terminal).toBe(false);
        expect(survivingTimestamps.has(index)).toBe(true);
        expect((await storage.findByReplayKey(`replay-${index}`))?.requestId)
          .toBe(requestId);
      }
      // A request can only exist once, even though the writer never got to
      // acknowledge the one it was in the middle of.
      expect(survivingTimestamps.size).toBe(rows.length);
    } finally {
      await storage?.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
    },
    180_000,
  );
});
