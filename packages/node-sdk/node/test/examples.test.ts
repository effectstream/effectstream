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

test("single-file facade declares a typed Midnight source and embedded database", async () => {
  const node = await import("../src/mod.ts");
  expect(node.pglite()).toEqual({
    kind: "pglite",
    dataDir: "memory://",
    port: 0,
  });
  expect(node.midnightContract({
    network: "preview",
    address: "a".repeat(64),
    startBlockHeight: "latest",
    ledger: { round: "uint128" },
  })).toEqual({
    kind: "midnight-contract",
    network: "preview",
    address: "a".repeat(64),
    startBlockHeight: "latest",
    ledger: { round: "uint128" },
    indexer: "https://indexer.preview.midnight.network/api/v4/graphql",
  });
});

test("single-file facade rejects malformed declarations early", async () => {
  const { midnightContract } = await import("../src/mod.ts");
  expect(() => midnightContract({
    network: "preview",
    address: "not-an-address",
    startBlockHeight: "latest",
    ledger: { round: "uint128" },
  })).toThrow(/64 hexadecimal/);
});

test("single-file template is one source file plus a manifest, importing only the SDK", async () => {
  const templateDir = new URL("../../../../templates/single-file/", import.meta.url);
  const files = [...new Bun.Glob("**/*").scanSync({
    cwd: templateDir.pathname,
    onlyFiles: true,
  })].sort();
  expect(files).toEqual(["minimal.ts", "package.json"]);

  const source = await Bun.file(new URL("minimal.ts", templateDir)).text();
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  expect(imports).toEqual(["@effectstream/node-sdk"]);
  expect(source).not.toMatch(/contract-counter|wallet|proofServer|generated|child_process/);

  // The version is pinned in the manifest, never in the import specifier, so
  // `update-packages.ts` can bump it without a release turning this test red.
  const manifest = await Bun.file(new URL("package.json", templateDir)).json();
  expect(manifest.dependencies["@effectstream/node-sdk"]).toMatch(/^\d+\.\d+\.\d+$/);
});
