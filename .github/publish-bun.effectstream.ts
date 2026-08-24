#!/usr/bin/env bun

import { $ } from "bun";
import { resolve, join, relative } from "path";
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from "fs";
import { Glob } from "bun";

// This script lives in `.github/`; the monorepo root is one level up. Everything
// below (package discovery, root package.json, relative dirs) is resolved against ROOT.
const ROOT = resolve(import.meta.dir, "..");

const FLAGS_HELP = `
Flags:
  --publish                real publish (default is dry-run via \`bun publish --dry-run\`)
  --release-version <ver>  validate <ver> (SemVer, must be > current root version) and
                           use it as the version to publish; also writes it into root package.json
  --dist-tag <tag>         required release channel: stable uses latest; prereleases use
                           a non-latest npm tag (for example next, beta, or canary)
  --allow-uncommitted      skip the git-clean check
  --allow-missing-readme   skip the per-package README presence / 400-char check
`;
function printFlags() {
  console.error(FLAGS_HELP);
}

const DEPRECATED = new Set([
  "@effectstream/explorer",
]);

const PACKAGE_META = {
  homepage: "https://effectstream.github.io/docs/",
  repository: {
    type: "git",
    url: "https://github.com/effectstream/effectstream",
  },
  bugs: {
    url: "https://github.com/effectstream/effectstream/issues",
  },
} as const;

const PACKAGE_DESCRIPTIONS: Record<string, string> = {
  "@effectstream/utils": "Shared utilities for the EffectStream framework",
  "@effectstream/log": "OpenTelemetry observability for EffectStream",
  "@effectstream/config": "Chain and runtime configuration for EffectStream",
  "@effectstream/precompile": "Precompile utilities for EffectStream",
  "@effectstream/chain-types": "Chain-specific type definitions for EffectStream",
  "@effectstream/crypto": "Multi-chain signature verification for EffectStream",
  "@effectstream/concise": "Type-safe schemas for EffectStream",
  "@effectstream/event-client": "MQTT-based event client for EffectStream",
  "@effectstream/wallets": "Wallet connector integrations for EffectStream",
  "@effectstream/coroutine": "Async control flow for EffectStream",
  "@effectstream/db": "PostgreSQL and PgLite database layer for EffectStream",
  "@effectstream/sync": "Blockchain sync service for EffectStream",
  "@effectstream/sm": "State machine DSL for EffectStream",
  "@effectstream/db-emulator": "In-memory test database for EffectStream",
  "@effectstream/event-server": "Event server for EffectStream",
  "@effectstream/runtime": "State machine runtime for EffectStream",
  "@effectstream/node-sdk": "Main application node SDK for EffectStream",
  "@effectstream/midnight-contracts": "Midnight network contract interfaces for EffectStream",
  "@effectstream/evm-hardhat": "Hardhat deployment and JSON-RPC utilities for EffectStream",
  "@effectstream/evm-contracts": "EVM smart contract interfaces for EffectStream",
  "@effectstream/bitcoin-contracts": "Bitcoin script utilities for EffectStream",
  "@effectstream/cardano-contracts": "Cardano contract interfaces for EffectStream",
  "@effectstream/avail-contracts": "Avail DA contract interfaces for EffectStream",
  "@effectstream/batcher-sdk": "Cross-chain transaction batching SDK for EffectStream",
  "@effectstream/batcher": "Cross-chain transaction batching for EffectStream",
  "@effectstream/explorer": "Block explorer for EffectStream",
  "@effectstream/tui": "Terminal UI for EffectStream",
  "@effectstream/orchestrator": "Multi-chain local development environment for EffectStream",
  "@effectstream/frontend-sdk": "React frontend SDK for EffectStream",
  "@effectstream/bitcoin-core": "Bitcoin Core binary wrapper for EffectStream",
  "@effectstream/ord": "Ord binary wrapper for EffectStream",
  "@effectstream/avail-light-client": "Avail light client binary wrapper for EffectStream",
  "@effectstream/avail-node": "Avail node binary wrapper for EffectStream",
  "@effectstream/midnight-indexer": "Midnight indexer binary wrapper for EffectStream",
  "@effectstream/midnight-node": "Midnight node binary wrapper for EffectStream",
  "@effectstream/midnight-proof-server": "Midnight proof server binary wrapper for EffectStream",
  "@effectstream/grafana-alloy": "Grafana Alloy binary wrapper for EffectStream",
  "@effectstream/grafana-loki": "Grafana Loki binary wrapper for EffectStream",
  "@effectstream/near-sandbox": "NEAR sandbox binary wrapper for EffectStream",
  "@effectstream/celestia": "Celestia binary wrapper for EffectStream",
};

// --- Version/channel helpers (pure, exported for unit testing) ---

type PrereleaseIdentifier =
  | { numeric: true; value: bigint; raw: string }
  | { numeric: false; value: string; raw: string };

export type ParsedSemver = {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: PrereleaseIdentifier[];
  build: string[];
  normalized: string;
};

// Strict SemVer 2.0.0 grammar. Numeric core/prerelease identifiers cannot have
// leading zeroes; build identifiers may. We intentionally allow one leading
// `v` for Git tags and normalize it away.
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** Parse a complete SemVer string, accepting and removing one leading `v`. */
export function parseSemver(input: string): ParsedSemver {
  const trimmed = input.trim();
  const candidate = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  const match = SEMVER_RE.exec(candidate);
  if (!match) {
    throw new Error(`"${input}" is not a valid SemVer version`);
  }

  const prereleaseRaw = match[4] ? match[4].split(".") : [];
  const prerelease: PrereleaseIdentifier[] = prereleaseRaw.map((raw) =>
    /^\d+$/.test(raw)
      ? { numeric: true, value: BigInt(raw), raw }
      : { numeric: false, value: raw, raw },
  );
  const build = match[5] ? match[5].split(".") : [];

  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
    build,
    normalized: candidate,
  };
}

/** Compare parsed SemVer values using SemVer 2.0.0 precedence rules. */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < count; i++) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left.numeric && right.numeric) {
      if (left.value < right.value) return -1;
      if (left.value > right.value) return 1;
      continue;
    }
    if (left.numeric !== right.numeric) return left.numeric ? -1 : 1;
    const leftText = String(left.value);
    const rightText = String(right.value);
    if (leftText < rightText) return -1;
    if (leftText > rightText) return 1;
  }

  // Build metadata does not participate in precedence.
  return 0;
}

/**
 * Resolve and validate a release version against the current one.
 * Strips an optional leading `v`, requires both to be MAJOR.MINOR.PATCH, and
 * requires the release version to be strictly greater than `current`.
 * Returns the normalized (no-`v`) version string, or throws on any violation.
 */
export function resolveReleaseVersion(tag: string, current: string): string {
  const next = parseSemver(tag);
  const cur = parseSemver(current);
  if (compareSemver(next, cur) <= 0) {
    throw new Error(
      `Release version ${next.normalized} must be strictly greater than current ${cur.normalized}`,
    );
  }
  return next.normalized;
}

export const STABLE_DIST_TAG = "latest";
const NPM_DIST_TAG_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;
const NPM_WILDCARD_RANGE_RE = /^x(?:$|\.)/i;

/**
 * Enforce the complete release-channel contract before any package mutation:
 * stable releases use `latest`; prereleases use an explicit non-`latest` npm tag.
 */
export function resolveDistTag(version: string, requestedTag?: string): string {
  if (requestedTag === undefined || requestedTag.length === 0) {
    throw new Error("--dist-tag is required for every release");
  }
  if (requestedTag !== requestedTag.trim()) {
    throw new Error(`Invalid dist-tag "${requestedTag}": surrounding whitespace is not allowed`);
  }
  if (/^[0-9v]/i.test(requestedTag)) {
    throw new Error(
      `Invalid dist-tag "${requestedTag}": npm tags must not begin with a digit or v`,
    );
  }
  if (!NPM_DIST_TAG_RE.test(requestedTag)) {
    throw new Error(
      `Invalid dist-tag "${requestedTag}": use letters, digits, dots, underscores, or hyphens`,
    );
  }
  if (NPM_WILDCARD_RANGE_RE.test(requestedTag)) {
    throw new Error(
      `Invalid dist-tag "${requestedTag}": npm wildcard SemVer ranges are not allowed`,
    );
  }

  const parsed = parseSemver(version);
  if (parsed.prerelease.length === 0) {
    if (requestedTag !== STABLE_DIST_TAG) {
      throw new Error(`Stable release ${parsed.normalized} must use dist-tag ${STABLE_DIST_TAG}`);
    }
    return requestedTag;
  }

  if (requestedTag === STABLE_DIST_TAG) {
    throw new Error(`Prerelease ${parsed.normalized} must not use dist-tag ${STABLE_DIST_TAG}`);
  }
  return requestedTag;
}

/**
 * Replace the top-level `"version": "..."` value in a package.json text while
 * preserving the rest of the file's formatting byte-for-byte. Only the first
 * `"version"` occurrence (the package's own version) is changed.
 */
export function setVersionInText(text: string, version: string): string {
  return text.replace(/"version":(\s*)"[^"]*"/, `"version":$1"${version}"`);
}

/** Read a `--flag value` or `--flag=value` argument from argv. */
function getFlagValue(flag: string): string | undefined {
  const argv = process.argv;
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  if (i !== -1 && i + 1 < argv.length) return argv[i + 1];
  return undefined;
}

if (import.meta.main) {
  const rootPkgPath = join(ROOT, "package.json");
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));

  // --- Resolve target version ---
  // With --release-version the tag drives (and validates) the version; otherwise
  // we publish whatever is already in root package.json (the original behavior).
  const releaseArg = getFlagValue("--release-version");
  let version: string;
  let distTag: string;
  try {
    if (releaseArg !== undefined) {
      version = resolveReleaseVersion(releaseArg, rootPkg.version);
    } else {
      version = parseSemver(rootPkg.version).normalized;
    }
    distTag = resolveDistTag(version, getFlagValue("--dist-tag"));
  } catch (e: any) {
    console.error(`\n❌ ${e.message}`);
    printFlags();
    process.exit(1);
  }

  if (releaseArg !== undefined) {
    console.log(
      `\n🔖 Release version ${version} (from "${releaseArg}"), current root ${rootPkg.version}, dist-tag ${distTag}`,
    );
  }

  // --- Step 1: Find all publishable packages ---

  console.log(`\n📦 Publishing version: ${version} on dist-tag ${distTag}\n`);

  const glob = new Glob("packages/**/package.json");
  const packageDirs: { name: string; dir: string; pkg: any }[] = [];

  for await (const path of glob.scan({ cwd: ROOT })) {
    if (path.includes("node_modules")) continue;

    const fullPath = resolve(ROOT, path);
    const pkg = JSON.parse(readFileSync(fullPath, "utf-8"));

    if (!pkg.name) continue;
    if (pkg.private) continue;
    if (DEPRECATED.has(pkg.name)) continue;

    packageDirs.push({
      name: pkg.name,
      dir: resolve(ROOT, path, ".."),
      pkg,
    });
  }

  packageDirs.sort((a, b) => a.name.localeCompare(b.name));

  // --- Step 1b: Verify each package ships a real README ---
  // npm renders the README on the package page. Without one, the package looks
  // abandoned. We fail the publish unless --allow-missing-readme is set.

  const MIN_README_CHARS = 400;
  const missingReadme: string[] = [];
  const stubReadme: string[] = [];

  for (const { name, dir } of packageDirs) {
    const readmePath = join(dir, "README.md");
    if (!existsSync(readmePath)) {
      missingReadme.push(name);
      continue;
    }
    const content = readFileSync(readmePath, "utf-8").trim();
    if (content.length < MIN_README_CHARS) stubReadme.push(name);
  }

  if (missingReadme.length || stubReadme.length) {
    console.error("\nREADME check failed:");
    for (const n of missingReadme) console.error(`  missing:  ${n}`);
    for (const n of stubReadme) console.error(`  stub:     ${n}`);
    if (!process.argv.includes("--allow-missing-readme")) {
      console.error(
        "\nAdd a real README.md to each package, or pass --allow-missing-readme to bypass.",
      );
      printFlags();
      process.exit(1);
    }
    console.error("  (continuing because --allow-missing-readme was set)\n");
  }

  // --- Step 1c: Check for uncommitted changes early (before we modify files) ---

  console.log("Checking git status...");

  const allowUncommitted = process.argv.includes("--allow-uncommitted");
  const status = await $`git status --porcelain`.text();
  if (status.trim().length > 0) {
    if (allowUncommitted) {
      console.log("  ⚠ Uncommitted changes (--allow-uncommitted)\n");
    } else {
      console.error("\n❌ Uncommitted changes detected:\n");
      console.error(status);
      console.error("Commit or stash changes before publishing.");
      printFlags();
      process.exit(1);
    }
  } else {
    console.log("  Working tree clean ✓\n");
  }

  // --- Step 1d: Apply the release version to root package.json ---
  // Done AFTER the git-clean check so the check still guards a pristine tree.
  // Edit the version string in place to preserve the file's exact formatting.
  if (releaseArg !== undefined && rootPkg.version !== version) {
    const rootText = readFileSync(rootPkgPath, "utf-8");
    writeFileSync(rootPkgPath, setVersionInText(rootText, version));
    console.log(`Set root package.json version → ${version}\n`);
  }

  // --- Cleanup: always restore each package.json to "pristine + new version" ---
  // We snapshot the committed on-disk text BEFORE any mutation. On exit we rewrite
  // each file from that snapshot with only `version` updated — which reverts both
  // the dependency pinning (Step 2c) and the metadata injection (Step 2b) while
  // keeping the intended version bump. npm still receives pinned deps + metadata
  // because those live on disk *during* `bun publish`; only the post-run tree is
  // version-only. Registered on exit/SIGINT/SIGTERM so deps are ALWAYS reverted.

  const pristine = new Map<string, string>();
  for (const { dir } of packageDirs) {
    const fp = join(dir, "package.json");
    pristine.set(fp, readFileSync(fp, "utf-8"));
  }

  // License files staged into each package dir for the tarball (Step 2d);
  // removed again by restore(). Declared here so restore() can see them even
  // if we bail out before the staging step runs.
  const LICENSE_FILES = ["LICENSE-MIT", "LICENSE-APACHE"];
  const stagedLicenses: string[] = [];

  let restored = false;
  function restore() {
    if (restored) return;
    restored = true;
    for (const { dir } of packageDirs) {
      const fp = join(dir, "package.json");
      // Rewrite the pristine TEXT with only the version string changed, so the
      // file's exact original formatting (and metadata/deps) is preserved.
      writeFileSync(fp, setVersionInText(pristine.get(fp)!, version));
    }
    for (const fp of stagedLicenses) {
      try {
        unlinkSync(fp);
      } catch {}
    }
    console.log(
      `\nRestored ${packageDirs.length} package.json files (version-only; deps & metadata reverted)` +
        (stagedLicenses.length ? ` and removed ${stagedLicenses.length} staged license files` : ""),
    );
  }
  process.on("exit", restore);
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    restore();
    process.exit(143);
  });

  // --- Step 2: Bump versions ---

  console.log(`Bumping ${packageDirs.length} packages to v${version}:\n`);

  for (const { name, dir, pkg } of packageDirs) {
    const fullPath = join(dir, "package.json");
    const oldVersion = pkg.version;

    if (oldVersion === version) {
      console.log(`  ${name} — already at ${version}`);
      continue;
    }

    pkg.version = version;
    writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`  ${name} — ${oldVersion} → ${version}`);
  }

  // --- Step 2b: Inject package metadata ---

  console.log(`Injecting package metadata...\n`);

  for (const { name, dir, pkg } of packageDirs) {
    const fullPath = join(dir, "package.json");
    const relDir = relative(ROOT, dir);

    pkg.homepage = PACKAGE_META.homepage;
    pkg.repository = { ...PACKAGE_META.repository, directory: relDir };
    pkg.bugs = { ...PACKAGE_META.bugs };
    if (PACKAGE_DESCRIPTIONS[name]) {
      pkg.description = PACKAGE_DESCRIPTIONS[name];
    }

    // Packages with a `files` allowlist would otherwise exclude the license
    // files staged in Step 2d (npm/bun only auto-include a file literally
    // named LICENSE/LICENCE, not LICENSE-MIT/LICENSE-APACHE).
    if (Array.isArray(pkg.files)) {
      for (const lf of LICENSE_FILES) {
        if (!pkg.files.includes(lf)) pkg.files.push(lf);
      }
    }

    writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  console.log(`  Updated ${packageDirs.length} packages\n`);

  // --- Step 2c: Replace workspace:* with concrete version ---
  // `bun publish` resolves `workspace:*` from the lockfile, which may still
  // point at the previous version. We replace `workspace:*` with the target
  // version in every package.json before publishing; restore() reverts it.

  console.log(`\nReplacing workspace:* with v${version}...`);

  const workspacePackageNames = new Set(packageDirs.map((p) => p.name));
  let patched = 0;

  for (const { dir, pkg } of packageDirs) {
    const fullPath = join(dir, "package.json");
    let changed = false;

    for (const depField of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = pkg[depField];
      if (!deps) continue;
      for (const [name, ver] of Object.entries(deps)) {
        if (typeof ver === "string" && ver.startsWith("workspace:") && workspacePackageNames.has(name)) {
          deps[name] = version;
          changed = true;
        }
      }
    }

    if (changed) {
      writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n");
      patched++;
    }
  }

  console.log(`  Patched ${patched} package.json files\n`);

  // --- Step 2d: Stage license files into each package ---
  // The published tarball should carry the actual license text, not just the
  // SPDX expression in package.json. Copy the root LICENSE-MIT/LICENSE-APACHE
  // into every package dir; restore() deletes the copies after publishing.
  // A package that already ships its own license file keeps it untouched.

  console.log(`Staging ${LICENSE_FILES.join(", ")} into each package...`);

  for (const lf of LICENSE_FILES) {
    if (!existsSync(join(ROOT, lf))) {
      console.error(`\n❌ Missing ${lf} at repo root`);
      printFlags();
      process.exit(1);
    }
  }

  for (const { dir } of packageDirs) {
    for (const lf of LICENSE_FILES) {
      const dest = join(dir, lf);
      if (existsSync(dest)) continue;
      copyFileSync(join(ROOT, lf), dest);
      stagedLicenses.push(dest);
    }
  }

  console.log(`  Staged ${stagedLicenses.length} license files\n`);

  // --- Step 3: Build packages that need it ---

  const BUILD_PACKAGES = new Set(["@effectstream/frontend-sdk"]);

  for (const { name, dir } of packageDirs) {
    if (!BUILD_PACKAGES.has(name)) continue;

    console.log(`\nBuilding ${name}...`);
    try {
      await $`cd ${dir} && bun run build`.quiet();
      console.log(`  ${name} built ✓`);
    } catch (e: any) {
      console.error(`  ${name} build failed ✗`);
      console.error(`    ${e.stderr?.toString().trim() || e.message}`);
      restore();
      printFlags();
      process.exit(1);
    }
  }

  // --- Step 4: Publish ---

  const isPublish = process.argv.includes("--publish");
  const dryRunArgs = isPublish ? [] : ["--dry-run"];

  console.log(`Running ${isPublish ? "LIVE" : "dry-run"} publish:\n`);

  let failed = 0;

  for (const { name, dir } of packageDirs) {
    const rel = relative(ROOT, dir);
    process.stdout.write(`  ${name} (${rel}) ... `);

    try {
      await $`cd ${dir} && bun publish ${dryRunArgs} --access public --tag ${distTag}`.quiet();
      console.log("✓");
    } catch (e: any) {
      console.log("✗");
      console.error(`    ${e.stderr?.toString().trim() || e.message}`);
      failed++;
    }
  }

  restore();

  console.log(
    `\nDone: ${packageDirs.length - failed} ok, ${failed} failed out of ${packageDirs.length} packages.`,
  );

  if (failed > 0) {
    printFlags();
    process.exit(1);
  }
}
