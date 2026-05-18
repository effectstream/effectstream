// Examples for the README — verify the subpath surface resolves.

import { test, expect } from "bun:test";

test("README: subpaths resolve to live modules", async () => {
  const runtime = await import("../src/mod.ts");
  expect(typeof runtime.init).toBe("function");
  expect(typeof runtime.start).toBe("function");
});

test("README: state-machine subpath exposes Stm", async () => {
  const sm = await import("../src/sm.ts");
  expect("Stm" in sm).toBe(true);
});

test("README: db subpath exposes getConnection", async () => {
  const db = await import("../src/db.ts");
  expect(typeof db.getConnection).toBe("function");
});

test("README: concise re-export keeps generateStmInput in shape", async () => {
  const concise = await import("../src/concise.ts");
  expect(typeof concise.generateStmInput).toBe("function");
  expect(typeof concise.parseStmInput).toBe("function");
});
