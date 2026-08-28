// Examples for the README — verify the subpath surface resolves.

import { test, expect } from "bun:test";

test("README: subpaths resolve to live modules", async () => {
  const runtime = await import("../src/mod.ts");
  expect(typeof runtime.runEffectstream).toBe("function");
  expect(typeof runtime.init).toBe("function");
  expect(typeof runtime.start).toBe("function");
});

test("README: state-machine subpath exposes one canonical constructor", async () => {
  const sm = await import("../src/sm.ts");
  expect(typeof sm.StateMachine).toBe("function");
  expect(sm.Stm).toBe(sm.StateMachine);
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

test("removed aggregate facade symbols are absent with no alias", async () => {
  const root = await import("../src/mod.ts");
  for (const symbol of [
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
  ]) {
    expect(symbol in root).toBe(false);
  }
  expect(await Bun.file(new URL("../src/single-file.ts", import.meta.url)).exists()).toBe(false);
});

test("ordinary replacement subpaths expose the complete composition surface", async () => {
  const [runtime, config, sync, sm, builtin, grammar, database] = await Promise.all([
    import("../src/runtime.ts"),
    import("../src/config.ts"),
    import("../src/sync.ts"),
    import("../src/sm.ts"),
    import("../src/sm-builtin.ts"),
    import("../src/sm-grammar.ts"),
    import("../src/db-start-pglite.ts"),
  ]);
  expect(typeof runtime.runEffectstream).toBe("function");
  expect(typeof config.ConfigBuilder).toBe("function");
  expect(typeof config.toSyncProtocolWithNetwork).toBe("function");
  expect(typeof config.resolveMidnightNetworkProfile).toBe("function");
  expect(typeof sync.getNtpTip).toBe("function");
  expect(typeof sync.getMidnightTip).toBe("function");
  expect(typeof sm.StateMachine).toBe("function");
  expect(sm.Stm).toBe(sm.StateMachine);
  expect(builtin.PrimitiveTypeMidnightGeneric).toBe("Midnight:Generic");
  expect(grammar.builtinGrammars.midnightGeneric).toBeDefined();
  expect(typeof database.startPglite).toBe("function");
});
