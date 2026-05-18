// Examples for the README — verify the public surface resolves without
// touching an actual Postgres or PgLite instance.

import { test, expect } from "bun:test";
import * as db from "../src/mod.ts";

test("README: connection helpers are exported", () => {
  expect(typeof db.getConnection).toBe("function");
  expect(typeof db.getPersistentConnection).toBe("function");
});

test("README: PgLite mutex helpers are exported", () => {
  expect(typeof db.acquireDBMutex).toBe("function");
  expect(typeof db.releaseDBMutex).toBe("function");
  expect(typeof db.waitUntilFree).toBe("function");
});

test("README: snapshot helpers are exported", () => {
  expect(typeof db.createSnapshot).toBe("function");
  expect(typeof db.runSnapshotLoop).toBe("function");
});

test("README: pgtyped query objects are exported", () => {
  expect(db.getBlockHeights).toBeDefined();
  expect(db.getBlockByHash).toBeDefined();
  expect(db.getLatestProcessedBlockHeight).toBeDefined();
});
