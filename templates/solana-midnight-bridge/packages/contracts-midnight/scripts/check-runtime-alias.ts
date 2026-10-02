#!/usr/bin/env bun
// Verifies the Midnight runtime layout this package depends on, as seen from
// this package's directory (where the compiled bridge module will live):
//   1. `@midnight-ntwrk/compact-runtime-0.20` resolves to compact-runtime 0.20.x
//      (the compiled 0.35.0 module checks `checkRuntimeVersion('0.20.0')`);
//   2. plain `@midnight-ntwrk/compact-runtime` still resolves to the engine's
//      version (not 0.20): the alias is a separate package and was not
//      collapsed onto it by link.sh's single-copy WASM step;
//   3. both runtimes load ONE physical `@midnightntwrk/onchain-runtime-v4`
//      (a second copy breaks the WASM `instanceof` checks);
//   4. with `--linked <monorepo root>` (link.sh): the engine's runtime and that
//      onchain-runtime are the monorepo's own copies, i.e. the single-copy step
//      actually ran, while the alias still is the template's 0.20 copy.
// Exits 1 on any violation. link.sh runs it last; it also works after a plain
// `bun install`.
import fs from "node:fs";
import path from "node:path";

const PKG_DIR = path.resolve(import.meta.dirname!, "..");
const ALIAS = "@midnight-ntwrk/compact-runtime-0.20";
const ALIAS_VERSION_RE = /^0\.20\./;
const linkedIdx = process.argv.indexOf("--linked");
const MONOREPO_ROOT = linkedIdx >= 0 ? fs.realpathSync(process.argv[linkedIdx + 1] ?? ".") : null;

type Found = { dir: string; real: string; name: string; version: string };

/** Finds `<dir>/node_modules/<spec>` walking up from `from` (Node resolution). */
function findPackage(spec: string, from: string): Found {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, "node_modules", spec);
    const pj = path.join(candidate, "package.json");
    if (fs.existsSync(pj)) {
      const json = JSON.parse(fs.readFileSync(pj, "utf8")) as { name: string; version: string };
      return { dir: candidate, real: fs.realpathSync(candidate), name: json.name, version: json.version };
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${spec} is not resolvable from ${from}`);
    dir = parent;
  }
}

const rel = (p: string) => path.relative(PKG_DIR, p) || ".";
const failures: string[] = [];

const alias = findPackage(ALIAS, PKG_DIR);
const plain = findPackage("@midnight-ntwrk/compact-runtime", PKG_DIR);
console.log(`[check-runtime-alias] ${ALIAS} -> ${alias.name}@${alias.version} (${rel(alias.real)})`);
console.log(`[check-runtime-alias] @midnight-ntwrk/compact-runtime -> ${plain.name}@${plain.version} (${rel(plain.real)})`);

if (alias.name !== "@midnight-ntwrk/compact-runtime" || !ALIAS_VERSION_RE.test(alias.version)) {
  failures.push(`${ALIAS} must be @midnight-ntwrk/compact-runtime 0.20.x, got ${alias.name}@${alias.version}`);
}
if (ALIAS_VERSION_RE.test(plain.version)) {
  failures.push(`plain @midnight-ntwrk/compact-runtime resolved to ${plain.version}: the engine's runtime was replaced`);
}
if (alias.real === plain.real) {
  failures.push(`the alias and the plain runtime are the same directory (${rel(alias.real)}): the alias was collapsed`);
}

// The onchain runtime each compact-runtime would load, from its own location.
const onchainFromAlias = findPackage("@midnightntwrk/onchain-runtime-v4", alias.real);
const onchainFromPlain = findPackage("@midnightntwrk/onchain-runtime-v4", plain.real);
console.log(`[check-runtime-alias] onchain-runtime-v4 via the alias -> ${onchainFromAlias.version} (${rel(onchainFromAlias.real)})`);
console.log(`[check-runtime-alias] onchain-runtime-v4 via the plain runtime -> ${onchainFromPlain.version} (${rel(onchainFromPlain.real)})`);
if (onchainFromAlias.real !== onchainFromPlain.real) {
  failures.push("compact-runtime 0.20 and the engine's compact-runtime load two different onchain-runtime-v4 copies");
}

// Bun's isolated linker also keeps a hoisted fallback tree
// (node_modules/.bun/node_modules) for packages that import a dependency they
// do not declare. Report what plain `compact-runtime` resolves to there.
let fallback: Found | null = null;
for (let dir = PKG_DIR; ; dir = path.dirname(dir)) {
  const fb = path.join(dir, "node_modules", ".bun", "node_modules", "@midnight-ntwrk", "compact-runtime");
  if (fs.existsSync(path.join(fb, "package.json"))) {
    const json = JSON.parse(fs.readFileSync(path.join(fb, "package.json"), "utf8")) as { name: string; version: string };
    fallback = { dir: fb, real: fs.realpathSync(fb), name: json.name, version: json.version };
    break;
  }
  if (path.dirname(dir) === dir) break;
}
if (fallback) {
  console.log(`[check-runtime-alias] Bun's hoisted fallback compact-runtime -> ${fallback.version} (${rel(fallback.real)})`);
}

if (MONOREPO_ROOT) {
  const monoNm = path.join(MONOREPO_ROOT, "node_modules") + path.sep;
  if (fallback && ALIAS_VERSION_RE.test(fallback.version)) {
    failures.push(`linked mode: Bun's hoisted fallback resolves plain compact-runtime to ${fallback.version}, not the engine's`);
  }
  console.log(`[check-runtime-alias] --linked: expecting the engine's copies under ${monoNm}`);
  if (!plain.real.startsWith(monoNm)) {
    failures.push(`linked mode: @midnight-ntwrk/compact-runtime is not the monorepo's copy (${plain.real})`);
  }
  if (!onchainFromPlain.real.startsWith(monoNm)) {
    failures.push(`linked mode: onchain-runtime-v4 is not the monorepo's copy (${onchainFromPlain.real})`);
  }
  if (alias.real.startsWith(monoNm)) {
    failures.push(`linked mode: the 0.20 alias points into the monorepo (${alias.real})`);
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`[check-runtime-alias] FAIL ${f}`);
  process.exit(1);
}
console.log("[check-runtime-alias] OK: alias intact, engine runtime intact, one onchain-runtime-v4");
