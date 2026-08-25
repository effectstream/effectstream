// Regression guard for the browser build of @effectstream/frontend-sdk.
//
// This is the ONLY package that needs a build before publish, and that build
// (`bun run build`, target: "browser") was never exercised by push/PR CI —
// only at release-publish time. A node-only module leaking into the browser
// bundle therefore passed every check and only blew up the release.
//
// That is exactly what happened (releases v0.100.19–v0.100.22 all failed to
// publish): @effectstream/wallets declares @effectstream/midnight-contracts as
// an OPTIONAL peer dep and reaches it only via
// `import("@effectstream/midnight-contracts/wallet-info")`. That module is
// node-only (`import { parseArgs } from "node:util"`), so bundling it into a
// browser build failed with:
//   "Browser polyfill for module 'node:util' doesn't have a matching export
//    named 'parseArgs'".
//
// Two checks:
//  1. A fast, pure assertion on the externalization invariant (`collectExternals`).
//  2. The real `bun run build` as a subprocess — this mirrors exactly what the
//     publish script does (`cd <pkg> && bun run build`). It runs in a clean
//     process on purpose: invoking `Bun.build` in-process inside `bun test`
//     fails to resolve workspace `.ts` sources (test-runner resolver
//     interference), which is unrelated to the bundle's correctness.

import { test, expect } from "bun:test";
import { resolve } from "path";
import { collectExternals } from "../build.ts";

const FRONTEND_DIR = resolve(import.meta.dir, "..");

test("optional/peer deps are externalized, never bundled into the browser build", () => {
  const externals = collectExternals(resolve(FRONTEND_DIR, "package.json"));

  // The dep whose node-only `parseArgs` import broke the release publish.
  expect(externals.has("@effectstream/midnight-contracts")).toBe(true);
  // Subpath wildcard, so `import(".../wallet-info")` stays external too.
  expect(externals.has("@effectstream/midnight-contracts/*")).toBe(true);

  // The other node-only optional peers of @effectstream/wallets must also stay
  // external (they ship WASM / use node:crypto and have no place in a browser
  // bundle).
  for (const dep of [
    "@lucid-evolution/lucid",
    "@midnightntwrk/ledger-v9",
    "@midnightntwrk/wallet-sdk-unshielded-wallet",
  ]) {
    expect(externals.has(dep)).toBe(true);
  }

  expect(externals.has("@midnight-ntwrk/ledger-v8")).toBe(false);
});

test("frontend-sdk browser build succeeds (`bun run build`)", async () => {
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: FRONTEND_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    // Surface the bundler output so the failure is actionable in CI.
    throw new Error(
      `frontend-sdk browser build failed (exit ${exitCode}):\n${stdout}\n${stderr}`,
    );
  }

  expect(exitCode).toBe(0);
}, 180_000);
