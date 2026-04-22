#!/usr/bin/env bun

import { $ } from "bun";
import { resolve, join, relative } from "path";
import { readFileSync, writeFileSync } from "fs";
import { Glob } from "bun";

const ROOT = import.meta.dir;
const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const version = rootPkg.version;

const DEPRECATED = new Set([
  "@effectstream/orchestrator",
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

// --- Step 3: Check for uncommitted changes ---

console.log("\nChecking git status...");

const status = await $`git status --porcelain`.text();
if (status.trim().length > 0) {
  console.error("\n❌ Uncommitted changes detected:\n");
  console.error(status);
  console.error("Commit or stash changes before publishing.");
  process.exit(1);
}

console.log("  Working tree clean ✓\n");

// --- Step 4: Dry-run publish ---

console.log("Running dry-run publish:\n");

let failed = 0;

for (const { name, dir } of packageDirs) {
  const rel = relative(ROOT, dir);
  process.stdout.write(`  ${name} (${rel}) ... `);

  try {
    await $`cd ${dir} && bun publish --dry-run --access public 2>&1`.quiet();
    console.log("✓");
  } catch (e: any) {
    console.log("✗");
    console.error(`    ${e.stderr?.toString().trim() || e.message}`);
    failed++;
  }
}

console.log(
  `\nDone: ${packageDirs.length - failed} ok, ${failed} failed out of ${packageDirs.length} packages.`
);

if (failed > 0) process.exit(1);
