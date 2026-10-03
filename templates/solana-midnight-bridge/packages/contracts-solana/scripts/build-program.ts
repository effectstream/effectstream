#!/usr/bin/env bun
// Compiles programs/bridge to build/bridge.so with the vendored cargo-build-sbf
// from @effectstream/solana-node (no global Solana CLI needed).
//
// Build NATIVELY (macOS or linux/amd64). On an Apple-silicon Docker host that
// emulates linux/amd64 with QEMU, every x86_64 rustc SIGSEGVs, so the in-Docker
// build fails; the committed build/bridge.so is what CI and the tests use.
//
// Two upstream side effects of Agave 3.0.14's cargo-build-sbf (issue 00055):
// - `--force-tools-install` (on by default here) downloads platform-tools v1.52
//   AND the SDK default v1.51 (~0.9 GB). Set SKIP_FORCE_TOOLS_INSTALL=1 to reuse
//   an installed toolchain on rebuilds.
// - it links its toolchain into rustup, and the post-build `install.sh` (seen
//   with --force-tools-install) uninstalls every rustup toolchain whose name
//   contains `solana` and links `1.84.1-sbpf-solana-v1.51`. To keep your own
//   rustup untouched, build with an isolated RUSTUP_HOME whose default is a
//   link to your host toolchain:
//     export RUSTUP_HOME=$PWD/.rustup-sbf
//     rustup toolchain link host-stable ~/.rustup/toolchains/stable-<host-triple>
//     rustup default host-stable
//     SKIP_FORCE_TOOLS_INSTALL=1 bun run build:program
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const PKG_DIR = import.meta.dirname!;
const ROOT = path.resolve(PKG_DIR, "..");
const PROGRAM_MANIFEST = path.join(ROOT, "programs", "bridge", "Cargo.toml");
const BUILD_DIR = path.join(ROOT, "build");
const OUT_SO = path.join(BUILD_DIR, "bridge.so");

function resolveCargoBuildSbf(): string {
  if (process.env.CARGO_BUILD_SBF) return process.env.CARGO_BUILD_SBF;
  // 1. The vendored binaries (this package's dep, or the monorepo's via link.sh).
  const candidates = [
    path.join(ROOT, "node_modules/@effectstream/solana-node/vendor/bin/cargo-build-sbf"),
    path.join(process.cwd(), "node_modules/@effectstream/solana-node/vendor/bin/cargo-build-sbf"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // 2. Fall back to whatever is on PATH.
  return "cargo-build-sbf";
}

function main() {
  if (!fs.existsSync(PROGRAM_MANIFEST)) {
    console.error(`[contracts-solana] Missing program manifest at ${PROGRAM_MANIFEST}`);
    process.exit(1);
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const bin = resolveCargoBuildSbf();
  // platform-tools v1.52 is the first whose bundled cargo (1.85+) supports
  // edition2024 deps; Agave 3.0.14's default is v1.51, so pin it (same as
  // templates/solana-starter).
  const toolsVersion = process.env.SOLANA_PLATFORM_TOOLS_VERSION ?? "v1.52";
  const args = [
    "--manifest-path", PROGRAM_MANIFEST,
    "--sbf-out-dir", BUILD_DIR,
    "--tools-version", toolsVersion,
  ];
  if (process.env.SKIP_FORCE_TOOLS_INSTALL !== "1") args.push("--force-tools-install");
  console.log(`[contracts-solana] $ ${bin} ${args.join(" ")}`);

  const result = spawnSync(bin, args, {
    stdio: "inherit",
    env: { ...process.env, CARGO_TERM_COLOR: "always" },
  });
  if (result.error != null || result.status == null) {
    // Almost always: the vendored toolchain is not on disk yet. It lives in
    // @effectstream/solana-node's vendor/ dir, which is only populated when the
    // validator binary downloads (chain:start), i.e. after this step.
    console.error(
      `[contracts-solana] could not execute ${bin}\n` +
        `  ${result.error ?? "spawn failed"}\n` +
        `\nbuild/bridge.so is committed, so the normal path never needs this:\n` +
        `run with SKIP_SOLANA_BUILD=1 (the default via start.dev.ts) to reuse it.\n` +
        `To rebuild, start the validator once so @effectstream/solana-node downloads\n` +
        `its vendored cargo-build-sbf, set CARGO_BUILD_SBF, or put one on PATH.`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[contracts-solana] cargo-build-sbf exited with status ${result.status}`);
    process.exit(result.status);
  }
  // cargo-build-sbf names the output after the crate's lib name: `bridge`.
  if (!fs.existsSync(OUT_SO)) {
    console.error(`[contracts-solana] Expected output not found at ${OUT_SO}.`);
    process.exit(1);
  }
  const so = fs.readFileSync(OUT_SO);
  console.log(
    `[contracts-solana] Built ${path.relative(ROOT, OUT_SO)}: ${so.length} B, sha256 ${createHash("sha256").update(so).digest("hex")}`,
  );
}

main();
