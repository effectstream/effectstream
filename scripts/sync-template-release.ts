#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { ENABLED_TEMPLATES } from "../templates/enabled.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
  "resolutions",
] as const;

function publishablePackageNames(root = ROOT): Set<string> {
  const names = new Set<string>();
  const glob = new Bun.Glob("packages/**/package.json");
  for (const relative of glob.scanSync({ cwd: root })) {
    if (relative.includes("node_modules")) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    if (pkg.name && !pkg.private && pkg.name !== "@effectstream/explorer") names.add(pkg.name);
  }
  return names;
}

export function synchronizeDependencyValue(
  dependencyName: string,
  value: unknown,
  version: string,
  publishable: Set<string>,
): unknown {
  if (typeof value !== "string") return value;
  if (publishable.has(dependencyName)) return version;
  const alias = /^npm:(@effectstream\/[^@]+)@(.+)$/.exec(value);
  if (alias && publishable.has(alias[1])) return `npm:${alias[1]}@${version}`;
  return value;
}

export function synchronizePackageJson(
  pkg: Record<string, any>,
  version: string,
  publishable: Set<string>,
): { pkg: Record<string, any>; changed: boolean } {
  const copy = structuredClone(pkg);
  let changed = false;
  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = copy[section];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
    for (const [name, value] of Object.entries(dependencies)) {
      const synchronized = synchronizeDependencyValue(name, value, version, publishable);
      if (synchronized !== value) {
        dependencies[name] = synchronized;
        changed = true;
      }
    }
  }
  return { pkg: copy, changed };
}

function versionArg(): string {
  const equals = process.argv.find((arg) => arg.startsWith("--version="));
  if (equals) return equals.slice("--version=".length);
  const index = process.argv.indexOf("--version");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  const fallback = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const version = value ?? fallback;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid release version: ${version}`);
  return version;
}

function packageJsonFiles(templateDir: string): string[] {
  const glob = new Bun.Glob("**/package.json");
  return [...glob.scanSync({ cwd: templateDir })]
    .filter((relative) => !relative.includes("node_modules"))
    .map((relative) => path.join(templateDir, relative))
    .sort();
}

function main(): void {
  const version = versionArg();
  const check = process.argv.includes("--check");
  const publishable = publishablePackageNames();
  const changed: string[] = [];

  for (const template of ENABLED_TEMPLATES) {
    const templateDir = path.join(ROOT, "templates", template);
    for (const file of packageJsonFiles(templateDir)) {
      const source = fs.readFileSync(file, "utf8");
      const original = JSON.parse(source);
      const synchronized = synchronizePackageJson(original, version, publishable);
      if (!synchronized.changed) continue;
      changed.push(path.relative(ROOT, file));
      if (!check) fs.writeFileSync(file, `${JSON.stringify(synchronized.pkg, null, 2)}\n`);
    }
  }

  const manifestFile = path.join(ROOT, ".github", "template-runtime-artifacts.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.templateBaselineVersion !== version) {
    changed.push(path.relative(ROOT, manifestFile));
    if (!check) {
      manifest.templateBaselineVersion = version;
      fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  if (changed.length === 0) {
    console.log(`Template baseline already matches ${version}`);
    return;
  }
  if (check) {
    throw new Error(`Template baseline is not synchronized to ${version}:\n${changed.map((file) => `  ${file}`).join("\n")}`);
  }
  console.log(`Synchronized ${changed.length} template-baseline file(s) to EffectStream ${version}`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
