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
  // No --tools-version by default: cargo-build-sbf from Agave 4.1.x bundles
  // platform-tools v1.54, whose cargo (1.85+) handles edition2024 deps. The old
  // v1.52 pin existed only to escape Solana 1.18.x's v1.41 default, and forcing
  // it now would download an older toolchain than the one already shipped.
  const toolsVersion = process.env.SOLANA_PLATFORM_TOOLS_VERSION;
  const args = [
    "--manifest-path",
    PROGRAM_MANIFEST,
    "--sbf-out-dir",
    BUILD_DIR,
    ...(toolsVersion ? ["--tools-version", toolsVersion] : []),
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

  if (result.status !== 0) {
    console.error(
      `[contracts-solana] cargo-build-sbf exited with status ${result.status}`,
    );
    process.exit(typeof result.status === "number" ? result.status : 1);
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
