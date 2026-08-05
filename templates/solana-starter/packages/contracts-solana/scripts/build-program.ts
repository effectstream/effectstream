#!/usr/bin/env bun
// Compiles the counter program to build/counter.so using the vendored
// cargo-build-sbf from @effectstream/solana-node (no global Solana CLI needed).
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const PKG_DIR = import.meta.dirname!;
const ROOT = path.resolve(PKG_DIR, "..");
const PROGRAM_MANIFEST = path.join(ROOT, "programs", "counter", "Cargo.toml");
const BUILD_DIR = path.join(ROOT, "build");
const OUT_SO = path.join(BUILD_DIR, "counter.so");

function resolveCargoBuildSbf(): string {
  // 1. Check the engine's vendored binaries (co-iteration with the monorepo).
  const candidates = [
    path.join(
      ROOT,
      "node_modules/@effectstream/solana-node/vendor/bin/cargo-build-sbf",
    ),
    path.join(
      process.cwd(),
      "node_modules/@effectstream/solana-node/vendor/bin/cargo-build-sbf",
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // 2. Fall back to whatever is on PATH.
  return "cargo-build-sbf";
}

function main() {
  if (!fs.existsSync(PROGRAM_MANIFEST)) {
    console.error(
      `[contracts-solana] Missing program manifest at ${PROGRAM_MANIFEST}`,
    );
    process.exit(1);
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const bin = resolveCargoBuildSbf();
  // platform-tools v1.52 is the first whose bundled cargo (1.85+) supports
  // edition2024 deps. Still pinned: cargo-build-sbf from @effectstream/solana-node
  // (Agave 3.0.14) bundles v1.51 — one short — so relying on its default would
  // regress the build. Agave 4.1.x does bundle v1.54, but 3.1+ can't run in
  // Docker at all (see the io_uring note in solana-node/index.js), so the newer
  // toolchain isn't available to us.
  const toolsVersion = process.env.SOLANA_PLATFORM_TOOLS_VERSION ?? "v1.52";
  const args = [
    "--manifest-path",
    PROGRAM_MANIFEST,
    "--sbf-out-dir",
    BUILD_DIR,
    "--tools-version",
    toolsVersion,
  ];
  if (process.env.SKIP_FORCE_TOOLS_INSTALL !== "1") {
    args.push("--force-tools-install");
  }
  console.log(`[contracts-solana] $ ${bin} ${args.join(" ")}`);

  const result = spawnSync(bin, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_TERM_COLOR: "always",
    },
  });

  if (result.error != null || result.status == null) {
    // spawnSync couldn't run it at all (status is undefined, not a number).
    // Almost always: the vendored toolchain isn't on disk yet. It lives in
    // @effectstream/solana-node's vendor/ dir, which is only populated when the
    // validator binary downloads — i.e. when chain:start runs, AFTER this. CI
    // hit exactly this and reported only "exited with status undefined".
    console.error(
      `[contracts-solana] could not execute ${bin}\n` +
        `  ${result.error ?? "spawn failed"}\n` +
        `\nbuild/counter.so is committed, so the normal path never needs this:\n` +
        `run with SKIP_SOLANA_BUILD=1 (the default via start.dev.ts) to reuse it.\n` +
        `To genuinely rebuild, start the validator once so\n` +
        `@effectstream/solana-node downloads its vendored cargo-build-sbf, or put\n` +
        `one on PATH.`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[contracts-solana] cargo-build-sbf exited with status ${result.status}`,
    );
    process.exit(result.status);
  }

  // The output is `<program_name>.so`. cargo-build-sbf names it after the
  // crate's lib name, which is `counter` here.
  const built = path.join(BUILD_DIR, "counter.so");
  if (!fs.existsSync(built)) {
    console.error(
      `[contracts-solana] Expected output not found at ${built}. Run with --debug for cargo output.`,
    );
    process.exit(1);
  }

  console.log(`[contracts-solana] Built ${path.relative(ROOT, OUT_SO)}`);
}

main();
