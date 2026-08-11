#!/usr/bin/env bun
/**
 * Compiles src/contract/offer-files.compact and verifies the output against
 * src/contract/manifest.json.
 *
 * `compact compile` is deterministic — two independent runs of the same source
 * with the same compiler version produce byte-identical output for all 16
 * files, prover keys included. So a sha256 manifest is an exact check, not a
 * heuristic: a mismatch means the source was edited or the compiler version
 * differs, both of which produce bindings that won't match the deployed
 * contract.
 *
 * Usage:
 *   bun run scripts/build-contract.ts                  # compile (if stale) + verify
 *   bun run scripts/build-contract.ts --force          # always recompile
 *   bun run scripts/build-contract.ts --verify-only    # verify, never compile
 *   bun run scripts/build-contract.ts --update-manifest
 *       Rewrite manifest.json from the current build output. Only correct when
 *       intentionally adopting a new contract or compiler version — and the
 *       redeployed contract address must be updated on the backend to match.
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

const CONTRACT_DIR = path.join(import.meta.dirname!, "..", "src", "contract");
const SOURCE = path.join(CONTRACT_DIR, "offer-files.compact");
const OUT_DIR = path.join(CONTRACT_DIR, "managed");
const MANIFEST = path.join(CONTRACT_DIR, "manifest.json");

/**
 * Compiler version pin. Changing this changes every output hash.
 *
 * Must stay in step with @midnight-ntwrk/compact-runtime in package.json — the
 * generated module calls checkRuntimeVersion() against it at import time. Both
 * track the node 1.0.0 stack (compiler 0.31.0 / runtime 0.16.0), matching the
 * other Midnight templates in this repo.
 */
const COMPILER_VERSION = "0.31.0";

interface Manifest {
  source: string;
  compilerVersion: string;
  provenance: string;
  files: Record<string, string>;
}

const force = process.argv.includes("--force");
const verifyOnly = process.argv.includes("--verify-only");
const updateManifest = process.argv.includes("--update-manifest");

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Every file under dir, as POSIX-style paths relative to it, sorted. */
function walk(dir: string): string[] {
  const out: string[] = [];
  const recurse = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) recurse(full);
      else out.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  };
  recurse(dir);
  return out.sort();
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function compile(): void {
  // Fail fast and legibly — a missing toolchain is by far the most likely
  // reason this script is being read at all.
  // Bun.spawnSync throws (rather than returning success: false) when the
  // executable isn't on PATH — which is the case this check exists for.
  let version: string | null = null;
  try {
    const probe = Bun.spawnSync(["compact", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (probe.success) version = probe.stdout.toString().trim();
  } catch {
    version = null;
  }
  if (version === null) {
    fail(
      `\`compact\` not found on PATH.\n\n` +
        `  This template compiles its Midnight contract from source. Install the\n` +
        `  Compact toolchain, then re-run:\n\n` +
        `      curl --proto '=https' --tlsv1.2 -LsSf \\\n` +
        `        https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh\n\n` +
        `  Docs: https://docs.midnight.network/develop/tutorial/building/`,
    );
  }
  console.log(
    `${version} → compiling offer-files.compact (compiler ${COMPILER_VERSION})`,
  );

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  const proc = Bun.spawnSync(
    ["compact", "compile", `+${COMPILER_VERSION}`, SOURCE, OUT_DIR],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (!proc.success) fail(`compact compile failed (exit ${proc.exitCode})`);
}

function verify(): void {
  if (!fs.existsSync(OUT_DIR)) {
    fail(`no build output at src/contract/managed — run \`bun run build:contract\``);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

  if (manifest.compilerVersion !== COMPILER_VERSION) {
    fail(
      `manifest.json pins compiler ${manifest.compilerVersion} but this script ` +
        `pins ${COMPILER_VERSION} — they must agree`,
    );
  }

  const sourceHash = sha256(SOURCE);
  if (sourceHash !== manifest.source) {
    fail(
      `offer-files.compact does not match manifest.json.\n\n` +
        `    expected  ${manifest.source}\n` +
        `    actual    ${sourceHash}\n\n` +
        `  The contract source has been edited. The deployed contract this app\n` +
        `  connects to almost certainly still runs the old code — redeploy it and\n` +
        `  re-run with --update-manifest, or revert the edit.`,
    );
  }

  const actual = walk(OUT_DIR);
  const expected = Object.keys(manifest.files).sort();

  const missing = expected.filter((f) => !actual.includes(f));
  const extra = actual.filter((f) => !expected.includes(f));
  const changed = expected
    .filter((f) => actual.includes(f))
    .filter((f) => sha256(path.join(OUT_DIR, f)) !== manifest.files[f]);

  if (missing.length || extra.length || changed.length) {
    const lines: string[] = [];
    for (const f of missing) lines.push(`    missing   ${f}`);
    for (const f of extra) lines.push(`    unexpected ${f}`);
    for (const f of changed) lines.push(`    mismatch  ${f}`);
    fail(
      `build output does not match manifest.json:\n\n${lines.join("\n")}\n\n` +
        `  compact compile is deterministic, so this means the compiler version\n` +
        `  differs from ${COMPILER_VERSION}, or the output was modified by hand.`,
    );
  }

  console.log(`✓ ${expected.length} files match manifest.json`);
}

function writeManifest(): void {
  const files: Record<string, string> = {};
  for (const f of walk(OUT_DIR)) files[f] = sha256(path.join(OUT_DIR, f));

  const manifest: Manifest = {
    source: sha256(SOURCE),
    compilerVersion: COMPILER_VERSION,
    provenance:
      "packages/contracts-midnight/contract-offer-files in " +
      "github.com/effectstream/zswap-offerfiles-kernel",
    files,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`✓ wrote manifest.json (${Object.keys(files).length} files)`);
}

if (updateManifest) {
  if (!fs.existsSync(OUT_DIR)) compile();
  writeManifest();
} else if (verifyOnly) {
  verify();
} else {
  // Skip the ~20s recompile when output is already present and correct.
  if (force || !fs.existsSync(OUT_DIR)) compile();
  verify();
}
