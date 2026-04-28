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

// --- Step 2b: Replace workspace:* with concrete version ---
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
