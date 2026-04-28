#!/usr/bin/env bun

import { $ } from "bun";
import { resolve, join, relative } from "path";
import { readFileSync, writeFileSync } from "fs";
import { Glob } from "bun";

const ROOT = import.meta.dir;
const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const version = rootPkg.version;

const DEPRECATED = new Set([
  "@effectstream/explorer",
]);

const PACKAGE_META = {
  homepage: "https://effectstream.github.io/docs/",
  repository: {
    type: "git",
    url: "https://github.com/PaimaStudios/paima-engine",
  },
  bugs: {
    url: "https://github.com/PaimaStudios/paima-engine/issues",
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
  "@effectstream/orchestrator-v2": "Multi-chain local development environment for EffectStream",
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

// --- Step 1: Find all publishable packages ---

console.log(`\n📦 Publishing version: ${version}\n`);

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

  writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n");
}

console.log(`  Updated ${packageDirs.length} packages\n`);

// --- Step 2c: Replace workspace:* with concrete version ---
// `bun publish` resolves `workspace:*` from the lockfile, which may still
// point at the previous version. We replace `workspace:*` with the target
// version in every package.json before publishing, then restore afterwards.

console.log(`\nReplacing workspace:* with v${version}...`);

const workspacePackageNames = new Set(packageDirs.map((p) => p.name));
const restoreList: { path: string; original: string }[] = [];

for (const { dir, pkg } of packageDirs) {
  const fullPath = join(dir, "package.json");
  const original = readFileSync(fullPath, "utf-8");
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
    restoreList.push({ path: fullPath, original });
  }
}

console.log(`  Patched ${restoreList.length} package.json files\n`);

// Register cleanup to restore workspace:* after publish
function restoreWorkspaceDeps() {
  for (const { path, original } of restoreList) {
    writeFileSync(path, original);
  }
  if (restoreList.length > 0) {
    console.log(`\nRestored workspace:* in ${restoreList.length} package.json files`);
  }
}

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
    process.exit(1);
  }
}

// --- Step 4: Check for uncommitted changes (ignoring build artifacts) ---

console.log("\nChecking git status...");

const allowUncommitted = process.argv.includes("--allow-uncommitted");
const status = await $`git status --porcelain`.text();
if (status.trim().length > 0) {
  if (allowUncommitted) {
    console.log("  ⚠ Uncommitted changes (--allow-uncommitted)\n");
  } else {
    console.error("\n❌ Uncommitted changes detected:\n");
    console.error(status);
    console.error("Commit or stash changes before publishing.");
    process.exit(1);
  }
} else {
  console.log("  Working tree clean ✓\n");
}

// --- Step 5: Publish ---

const isPublish = process.argv.includes("--publish");
const dryRunFlag = isPublish ? "" : "--dry-run";

console.log(`Running ${isPublish ? "LIVE" : "dry-run"} publish:\n`);

let failed = 0;

for (const { name, dir } of packageDirs) {
  const rel = relative(ROOT, dir);
  process.stdout.write(`  ${name} (${rel}) ... `);

  try {
    await $`cd ${dir} && bun publish ${dryRunFlag} --access public 2>&1`.quiet();
    console.log("✓");
  } catch (e: any) {
    console.log("✗");
    console.error(`    ${e.stderr?.toString().trim() || e.message}`);
    failed++;
  }
}

restoreWorkspaceDeps();

console.log(
  `\nDone: ${packageDirs.length - failed} ok, ${failed} failed out of ${packageDirs.length} packages.`
);

if (failed > 0) process.exit(1);
