#!/usr/bin/env bun

import { resolve } from "node:path";

const PINNED_BASE = "b267fa2e795fcd1bd8e295d4d9b8eb65814b11ee";
const REPO_ROOT = resolve(import.meta.dir, "..");
const base = process.argv[2] ?? PINNED_BASE;

interface Scope {
  name: string;
  args: string[];
}

function git(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();

  if (result.exitCode !== 0) {
    console.error(`FAIL templates guard: git ${args.join(" ")} exited ${result.exitCode}`);
    if (stderr.length > 0) console.error(stderr);
    process.exit(1);
  }

  return stdout;
}

if (!/^[0-9a-f]{40}$/.test(base)) {
  console.error(`FAIL templates guard: base must be a full 40-character lowercase SHA, got ${JSON.stringify(base)}`);
  process.exit(1);
}

git(["rev-parse", "--verify", `${base}^{commit}`]);

const scopes: Scope[] = [
  {
    name: `committed ${base}..HEAD`,
    args: ["diff", "--name-only", `${base}..HEAD`, "--", "templates/"],
  },
  {
    name: "working tree",
    args: ["diff", "--name-only", "--", "templates/"],
  },
  {
    name: "index",
    args: ["diff", "--cached", "--name-only", "--", "templates/"],
  },
  {
    name: "untracked",
    args: ["ls-files", "--others", "--exclude-standard", "--", "templates/"],
  },
];

let failed = false;

for (const scope of scopes) {
  const paths = git(scope.args);
  if (paths.length === 0) {
    console.log(`PASS templates/${scope.name}: no changes`);
    continue;
  }

  failed = true;
  console.error(`FAIL templates/${scope.name}:`);
  console.error(paths);
}

if (failed) {
  console.error("FAIL templates guard: templates/** must remain unchanged");
  process.exit(1);
}

console.log(`PASS templates guard against ${base}`);
