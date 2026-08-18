// The default storage backend, and what happens to a batcher that was already
// running when it changed.
//
// A default is not a detail here: almost nothing passes `storage` explicitly,
// so whatever the constructor picks is what every template, every dev loop and
// every deployment actually runs. Flipping it to the database is only safe if
// an existing `pending-inputs.jsonl` walks across on its own — an operator who
// upgrades and silently loses their queue has been robbed, not migrated.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createNewBatcher } from "../core/batcher.ts";
import { DatabaseStorage } from "../core/storage.ts";
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

describe("default storage backend", () => {
  test("a batcher with no storage configured gets the database, and adopts a queue file left by FileStorage", async () => {
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

      const batcher = createNewBatcher({
        pollingIntervalMs: 1000,
        enableHttpServer: false,
        enableEventSystem: false,
      });
      batcher.addBlockchainAdapter("only", stubAdapter());

      const storage = storageOf(batcher);
      expect(storage).toBeInstanceOf(DatabaseStorage);

      try {
        await batcher.init({ startPolling: false });

        // The queue survived the upgrade, stamped with the target it was
        // routed to, and is readable through the new backend.
        const rows = await storage.getAllInputs();
        expect(rows.length).toBe(1);
        expect(rows[0].address).toBe("addr-upgraded");
        expect(rows[0].target).toBe("only");

        // The file is consumed exactly once and kept, not deleted: an operator
        // who wants to see what moved still can.
        expect(existsSync("batcher-data/pending-inputs.jsonl")).toBe(false);
        expect(existsSync("batcher-data/pending-inputs.jsonl.imported")).toBe(true);
        // The database lives beside it, in its own subdirectory.
        expect(existsSync("batcher-data/pglite")).toBe(true);
      } finally {
        await storage.close?.();
      }
    });
  }, 120_000);

  test("constructing a batcher touches no disk until it is initialised", async () => {
    await inTempCwd(async () => {
      const batcher = createNewBatcher({
        pollingIntervalMs: 1000,
        enableHttpServer: false,
        enableEventSystem: false,
      });
      batcher.addBlockchainAdapter("only", stubAdapter());

      // Constructing one to read its config should not leave a database behind.
      expect(existsSync("batcher-data")).toBe(false);
    });
  });
});
