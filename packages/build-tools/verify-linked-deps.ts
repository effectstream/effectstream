#!/usr/bin/env bun
/**
 * Verify that every external npm dependency required by symlinked @effectstream
 * packages can resolve from the template root, optionally install missing ones
 * with `bun install --no-save`, and report version skew between monorepo and
 * template trees.
 *
 * Why this exists: link.sh symlinks ~20 @effectstream/* packages from the
 * monorepo, but the template's own package.json typically declares only a
 * couple at top level (e.g. midnight-contracts, orchestrator). The published
 * npm versions of those top-level packages pull in many transitives, but the
 * monorepo source can be ahead of npm — a newly added dep in monorepo source
 * won't be in any published package.json yet. This script walks the linked
 * monorepo packages' source-side package.jsons (BFS) and hoists any external
 * dep that doesn't resolve from the template root, so the live-linked code
 * has all of its deps available.
 *
 * Usage (from link.sh — install missing, advisory on skew):
 *   bun run verify-linked-deps.ts --template /path/to/template --link-sh /path/to/link.sh --install
 *
 * Usage (verify only, no installs):
 *   bun run verify-linked-deps.ts --template ... --link-sh ... --dry-run
 *
 * Usage (CI gate):
 *   bun run verify-linked-deps.ts --template ... --link-sh ... --strict-missing
 *
 * Flags:
 *   --install          install missing deps with `bun install --no-save`
 *   --dry-run          report missing deps, do not install
 *   --include-dev      include devDependencies when walking linked package graphs
 *   --strict-missing   exit 1 if any external dep is unresolvable
 *   --strict           exit 1 on missing OR version skew (noisy; full CI gate)
 *   --json <path>      write {external, missing} JSON report to <path>
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";

type DepMap = Record<string, string>;
type PkgJson = {
  name?: string;
  dependencies?: DepMap;
  devDependencies?: DepMap;
  optionalDependencies?: DepMap;
  workspaces?: string[] | { packages: string[] };
};

type ExternalDep = { name: string; version: string };

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(name);
}

function opt(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const templateRoot = resolve(opt("--template") ?? process.cwd());
const linkShPath = resolve(opt("--link-sh") ?? join(templateRoot, "link.sh"));
const monorepoRoot = resolve(opt("--monorepo") ?? join(templateRoot, "../.."));
const doInstall = flag("--install");
const dryRun = flag("--dry-run");
const includeDev = flag("--include-dev");
const strict = flag("--strict");
const strictMissing = flag("--strict-missing") || strict;
const jsonOut = opt("--json");

if (!existsSync(linkShPath)) {
  console.error(`link.sh not found: ${linkShPath}`);
  process.exit(1);
}

/** Parse `link_pkg "effectstream" "<short>" "<path>"` from link.sh with shell vars expanded */
function parseLinkManifest(linkSh: string): Map<string, string> {
  const map = new Map<string, string>();
  const p = join(monorepoRoot, "packages");
  const scriptDir = templateRoot;

  for (const m of linkSh.matchAll(
    /link_pkg\s+"effectstream"\s+"([^"]+)"\s+"([^"]+)"/g,
  )) {
    let pkgPath = m[2];
    pkgPath = pkgPath
      .replace(/\$P\b/g, p)
      .replace(/\$SCRIPT_DIR\b/g, scriptDir)
      .replace(/\$MONOREPO_ROOT\b/g, monorepoRoot);
    map.set(m[1], resolve(pkgPath));
  }
  return map;
}

const effectstreamPathByShort = parseLinkManifest(
  readFileSync(linkShPath, "utf8"),
);

function effectstreamName(shortName: string): string {
  return `@effectstream/${shortName}`;
}

/** Build @effectstream/name -> absolute dir from link manifest package.json names */
function buildEffectstreamDirMap(): Map<string, string> {
  const byName = new Map<string, string>();
  for (const [shortName, dir] of effectstreamPathByShort) {
    if (!existsSync(dir)) continue;
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) {
      byName.set(effectstreamName(shortName), dir);
      continue;
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PkgJson;
    byName.set(pkg.name ?? effectstreamName(shortName), dir);
  }
  return byName;
}

let monorepoNameCache: Map<string, string> | null = null;

function findMonorepoPackageDir(packageName: string): string | undefined {
  if (!monorepoNameCache) {
    monorepoNameCache = new Map();
    const packagesRoot = join(monorepoRoot, "packages");
    if (!existsSync(packagesRoot)) return undefined;

    const stack = [packagesRoot];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      const pkgJsonPath = join(dir, "package.json");
      if (existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as PkgJson;
          if (pkg.name?.startsWith("@effectstream/")) {
            monorepoNameCache.set(pkg.name, dir);
          }
        } catch {
          /* skip */
        }
      }
      for (const entry of entries) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        try {
          if (statSync(full).isDirectory()) stack.push(full);
        } catch {
          /* skip */
        }
      }
    }
  }
  return monorepoNameCache.get(packageName);
}

function parseNpmAlias(version: string): { name: string; version: string } {
  if (version.startsWith("npm:")) {
    const spec = version.slice(4);
    const at = spec.lastIndexOf("@");
    if (at > 0) {
      return { name: spec.slice(0, at), version: spec.slice(at + 1) };
    }
    return { name: spec, version: "*" };
  }
  return { name: "", version };
}

function isEffectstreamDep(name: string): boolean {
  return name.startsWith("@effectstream/");
}

function isWorkspaceVersion(version: string): boolean {
  return version === "workspace:*" || version.startsWith("workspace:");
}

function mergeVersion(existing: string | undefined, incoming: string): string {
  if (!existing) return incoming;
  const exact = (v: string) =>
    !v.startsWith("^") && !v.startsWith("~") && !v.startsWith(">=");
  if (exact(incoming)) return incoming;
  if (exact(existing)) return existing;
  return incoming;
}

function readPkgJson(dir: string): PkgJson | null {
  const p = join(dir, "package.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as PkgJson;
}

function collectDepSections(pkg: PkgJson, withDev: boolean): DepMap {
  return {
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
    ...(withDev ? pkg.devDependencies : {}),
  };
}

function discoverWorkspacePackageJsons(): string[] {
  const rootPkg = readPkgJson(templateRoot);
  if (!rootPkg?.workspaces) return [];

  const patterns: string[] = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : rootPkg.workspaces.packages;

  const files: string[] = [];
  for (const pattern of patterns) {
    const base = pattern.replace(/\/\*$/, "");
    const absBase = join(templateRoot, base);
    if (!existsSync(absBase)) continue;
    if (pattern.endsWith("/*")) {
      for (const entry of readdirSync(absBase)) {
        const pkgDir = join(absBase, entry);
        const pj = join(pkgDir, "package.json");
        if (existsSync(pj)) files.push(pj);
      }
    } else if (existsSync(join(absBase, "package.json"))) {
      files.push(join(absBase, "package.json"));
    }
  }
  return files;
}

function resolveEffectstreamDir(
  name: string,
  effectstreamDirs: Map<string, string>,
): string | undefined {
  if (effectstreamDirs.has(name)) return effectstreamDirs.get(name);
  return findMonorepoPackageDir(name);
}

function collectExternalDeps(): Map<string, string> {
  const effectstreamDirs = buildEffectstreamDirMap();
  const external = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  const enqueueDir = (dir: string) => {
    const resolved = resolve(dir);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    queue.push(resolved);
  };

  for (const dir of effectstreamDirs.values()) {
    enqueueDir(dir);
  }

  for (const pkgJsonPath of discoverWorkspacePackageJsons()) {
    const pkg = readPkgJson(join(pkgJsonPath, ".."));
    if (!pkg) continue;
    const deps = collectDepSections(pkg, false);
    for (const [name] of Object.entries(deps)) {
      if (!isEffectstreamDep(name)) continue;
      const dir = resolveEffectstreamDir(name, effectstreamDirs);
      if (dir) enqueueDir(dir);
    }
  }

  while (queue.length > 0) {
    const dir = queue.shift()!;
    const pkg = readPkgJson(dir);
    if (!pkg) continue;

    const deps = collectDepSections(pkg, includeDev);
    for (const [depName, depVersion] of Object.entries(deps)) {
      if (isEffectstreamDep(depName) || isWorkspaceVersion(depVersion)) {
        const innerDir = resolveEffectstreamDir(depName, effectstreamDirs);
        if (innerDir) enqueueDir(innerDir);
        continue;
      }

      if (depVersion.startsWith("npm:")) {
        const alias = parseNpmAlias(depVersion);
        external.set(
          alias.name,
          mergeVersion(external.get(alias.name), alias.version),
        );
        continue;
      }

      if (depVersion.startsWith("file:") || depVersion.startsWith("link:")) {
        continue;
      }

      external.set(depName, mergeVersion(external.get(depName), depVersion));
    }
  }

  return external;
}

function nodeModulesPackageDir(packageName: string): string {
  if (packageName.startsWith("@")) {
    const slash = packageName.indexOf("/");
    return join(
      templateRoot,
      "node_modules",
      packageName.slice(0, slash),
      packageName.slice(slash + 1),
    );
  }
  return join(templateRoot, "node_modules", packageName);
}

/** Bun may cache failed resolutions in-process; also check node_modules on disk. */
function canResolveFromTemplate(packageName: string): boolean {
  if (existsSync(join(nodeModulesPackageDir(packageName), "package.json"))) {
    return true;
  }
  try {
    Bun.resolveSync(packageName, templateRoot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan `<root>/node_modules/.bun/` for installed copies of `packageName`.
 * Bun's isolated linker stores each (name, version, peer-hash) as its own dir.
 * Returns the distinct semver versions present (multiple peer-hashes collapse to one version).
 */
function findInstalledVersionsInBunCache(
  root: string,
  packageName: string,
): string[] {
  const bunDir = join(root, "node_modules", ".bun");
  if (!existsSync(bunDir)) return [];
  const prefix = packageName.startsWith("@")
    ? `${packageName.slice(1).replace("/", "+")}@`
    : `${packageName}@`;
  const fullPrefix = packageName.startsWith("@") ? `@${prefix}` : prefix;

  const versions = new Set<string>();
  try {
    for (const entry of readdirSync(bunDir)) {
      if (!entry.startsWith(fullPrefix)) continue;
      const afterAt = entry.slice(fullPrefix.length);
      const plus = afterAt.indexOf("+");
      const ver = plus >= 0 ? afterAt.slice(0, plus) : afterAt;
      versions.add(ver);
    }
  } catch {
    /* skip */
  }
  return [...versions];
}

type SkewReport = {
  name: string;
  monorepo: string[];
  template: string[];
};

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

/**
 * For every external dep the linked monorepo packages need, compare its installed
 * version set in the monorepo's `.bun/` (where linked packages resolve via realpath)
 * to its installed version set in the template's `.bun/` (where template-owned packages
 * resolve). If the two sets differ, the dep will be loaded at different versions in
 * the same Bun process — the source of Effect-style "duplicate dependency" warnings.
 *
 * Sets that match (even if multi-version, e.g. {3.5.0, 3.6.1} in both) are not flagged:
 * they reflect the same resolution outcome in both trees, not a template/monorepo mismatch.
 */
function detectVersionSkew(external: Map<string, string>): SkewReport[] {
  const reports: SkewReport[] = [];
  for (const name of external.keys()) {
    const monorepo = findInstalledVersionsInBunCache(monorepoRoot, name);
    const template = findInstalledVersionsInBunCache(templateRoot, name);
    if (monorepo.length === 0 || template.length === 0) continue;
    if (!setsEqual(monorepo, template)) {
      reports.push({ name, monorepo, template });
    }
  }
  reports.sort((a, b) => a.name.localeCompare(b.name));
  return reports;
}

async function main(): Promise<void> {
  const external = collectExternalDeps();
  const missing: ExternalDep[] = [];

  for (const [name, version] of external) {
    if (!canResolveFromTemplate(name)) {
      missing.push({ name, version });
    }
  }

  missing.sort((a, b) => a.name.localeCompare(b.name));

  const summary = {
    templateRoot,
    totalExternal: external.size,
    missing: missing.map((d) => `${d.name}@${d.version}`),
  };

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify(
        { ...summary, external: Object.fromEntries(external) },
        null,
        2,
      ),
    );
  }

  console.log(
    `Collected ${external.size} external deps; ${missing.length} not resolvable from template root.`,
  );

  if (missing.length === 0) {
    console.log("All external deps already resolve.");
    reportVersionSkew(external);
    return;
  }

  const specs = missing.map((d) => `${d.name}@${d.version}`);
  console.log(
    `Missing packages (linked monorepo source needs these but template can't resolve them):`,
  );
  for (const s of specs) console.log(`  ${s}`);

  if (dryRun || !doInstall) {
    if (!doInstall && !dryRun) {
      console.log("\nPass --install to run: bun install --no-save ...");
    }
    reportVersionSkew(external);
    if (strictMissing) process.exit(1);
    return;
  }

  console.log("\nInstalling missing deps (bun install --no-save)...");
  const installArgs = missing.map((d) => `${d.name}@${d.version}`);
  const result = await $`bun install --no-save ${installArgs}`
    .cwd(templateRoot)
    .nothrow();
  if (result.exitCode !== 0) {
    console.error("bun install --no-save failed");
    if (strictMissing) process.exit(1);
    return;
  }

  const stillMissing: string[] = [];
  for (const { name } of missing) {
    if (!canResolveFromTemplate(name)) stillMissing.push(name);
  }

  if (stillMissing.length > 0) {
    console.error("Still missing after install:", stillMissing.join(", "));
    if (strictMissing) process.exit(1);
  } else {
    console.log("All missing deps now resolve.");
  }

  reportVersionSkew(external);
}

function reportVersionSkew(external: Map<string, string>): void {
  const skew = detectVersionSkew(external);
  if (skew.length === 0) return;

  console.error("");
  console.error(
    `Version skew detected: ${skew.length} dep(s) have different versions installed in monorepo vs template.`,
  );
  console.error(
    "Multiple versions of these packages will be loaded at runtime, which can cause subtle bugs",
  );
  console.error(
    "(e.g. Effect-TS 'Executing an Effect versioned X with a Runtime of version Y' warnings).",
  );
  console.error("");
  for (const s of skew) {
    console.error(`  ${s.name}:`);
    console.error(`    monorepo: ${s.monorepo.join(", ") || "(none)"}`);
    console.error(`    template: ${s.template.join(", ") || "(none)"}`);
  }
  console.error("");
  console.error(
    "Fix by aligning versions — add `overrides` to the template's root package.json,",
  );
  console.error(
    "or loosen exact pins so transitive resolution converges. Then run `./link.sh --repair`.",
  );

  if (strict) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
