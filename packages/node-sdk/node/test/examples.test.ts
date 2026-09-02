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

// The template-only single-file facade was removed. It was a parallel
// configuration/runtime language that existed for one example, so its absence is
// asserted here rather than left to a reviewer's memory: applications compose
// the ordinary public packages directly (see templates/single-file/minimal.ts).
const REMOVED_FACADE_EXPORTS = [
  "runNode",
  "pglite",
  "midnightContract",
  "MidnightNetwork",
  "PgliteOptions",
  "PgliteDatabase",
  "LedgerState",
  "MidnightContractOptions",
  "MidnightContractSource",
  "MidnightTransition",
  "RunNodeOptions",
] as const;

test("the single-file facade source file is gone", async () => {
  const facade = new URL("../src/single-file.ts", import.meta.url);
  expect(await Bun.file(facade).exists()).toBe(false);
});

test("no facade symbol survives on the root entrypoint under any alias", async () => {
  const node = await import("../src/mod.ts");
  const exported = new Set(Object.keys(node));
  const survivors = REMOVED_FACADE_EXPORTS.filter((name) => exported.has(name));
  expect(survivors).toEqual([]);

  // Types erase at runtime, so also assert on the source text: a re-export or a
  // renamed alias of the facade would still name the file.
  const mod = await Bun.file(new URL("../src/mod.ts", import.meta.url)).text();
  expect(mod).not.toMatch(/single-file/);
});

test("the ordinary composition surface an application uses stays resolvable", async () => {
  const config = await import("../src/config.ts");
  expect(typeof config.ConfigBuilder).toBe("function");
  expect(typeof config.withEffectstreamStaticConfig).toBe("function");
  expect(typeof config.toSyncProtocolWithNetwork).toBe("function");
  expect("ConfigNetworkType" in config).toBe(true);
  expect("ConfigSyncProtocolType" in config).toBe(true);

  const startPglite = await import("../src/db-start-pglite.ts");
  expect(typeof startPglite.startPglite).toBe("function");

  const builtin = await import("../src/sm-builtin.ts");
  expect("PrimitiveTypeMidnightGeneric" in builtin).toBe(true);

  const grammar = await import("../src/sm-grammar.ts");
  expect("midnightGeneric" in grammar.builtinGrammars).toBe(true);
});
