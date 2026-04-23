#!/usr/bin/env bun

import { $ } from "bun";

const version = process.argv[2];
if (!version) {
  console.error("Usage: bun unpublish-bun.effectstream.ts <version> [--run]");
  console.error("  Without --run, performs a dry run showing what would happen.");
  process.exit(1);
}

const isRun = process.argv.includes("--run");

// --- Dependency tree ---
// Each key lists the internal @effectstream/* packages it depends on.
// Removal order is derived from this: leaves (no one depends on them) first,
// then work inward toward the roots (depended on by many).
// Update this map when adding/removing packages.

const DEPENDENCY_TREE: Record<string, string[]> = {
  // Level 0 — no internal deps (roots, removed last)
  "utils": [],
  "coroutine": [],
  "chain-types": [],
  "precompile": [],
  "db-emulator": [],

  // Level 1 — depend only on Level 0
  "crypto": ["utils"],
  "config": ["utils"],
  "log": ["utils"],
  "event-client": ["utils"],
  "event-server": ["utils"],
  "midnight-contracts": ["utils"],

  // Level 2
  "concise": ["utils", "crypto"],

  // Level 3
  "wallets": ["utils", "crypto", "concise", "event-client"],

  // Level 4 — circular: db ↔ sync, db ↔ runtime
  "sync": ["config", "db", "log", "utils"],
  "db": ["coroutine", "log", "runtime", "sync", "utils"],
  "sm": ["concise", "config", "coroutine", "crypto", "db", "log", "utils"],
  "runtime": ["db", "sm", "log", "sync", "utils", "config", "crypto", "concise", "coroutine", "event-client", "event-server"],

  // Leaves — nothing depends on these (removed first)
  "node-sdk": ["chain-types", "config", "coroutine", "db", "db-emulator", "event-server", "precompile", "runtime", "sm", "sync"],
  "frontend-sdk": ["wallets"],
  "batcher-sdk": ["utils", "crypto", "event-client", "midnight-contracts"],
  "orchestrator-v2": ["db"],
  "evm-hardhat": ["log", "utils"],

  // Leaves — no internal deps at all
  "avail-contracts": [],
  "bitcoin-contracts": [],
  "cardano-contracts": [],
  "evm-contracts": [],
  "celestia": [],
  "bitcoin-core": [],
  "grafana-alloy": [],
  "grafana-loki": [],
  "near-sandbox": [],
  "npm-avail-light-client": [],
  "npm-avail-node": [],
  "npm-midnight-indexer": [],
  "npm-midnight-node": [],
  "npm-midnight-proof-server": [],
  "ord": [],
};

const SCOPE = "@effectstream";

// --- Classify packages: leaves can be unpublished, non-leaves must be deprecated ---
// A "leaf" is a package that no other package in the tree depends on.
// Since the latest stable version always exists and keeps its dependencies,
// non-leaf packages will always have dependents in the registry.

function classifyPackages(tree: Record<string, string[]>) {
  const dependedOnBy = new Map<string, Set<string>>();
  for (const name of Object.keys(tree)) {
    dependedOnBy.set(name, new Set());
  }
  for (const [name, deps] of Object.entries(tree)) {
    for (const dep of deps) {
      dependedOnBy.get(dep)?.add(name);
    }
  }

  const unpublishable: string[] = []; // leaves — nothing depends on them
  const deprecateOnly: string[] = []; // non-leaves — latest stable will always block

  for (const [name, dependents] of dependedOnBy) {
    if (dependents.size === 0) {
      unpublishable.push(name);
    } else {
      deprecateOnly.push(name);
    }
  }

  return {
    unpublishable: unpublishable.sort(),
    deprecateOnly: deprecateOnly.sort(),
  };
}

const { unpublishable, deprecateOnly } = classifyPackages(DEPENDENCY_TREE);

// --- Print the plan ---

console.log(
  `\n${isRun ? "🗑️  REMOVING" : "🔍 DRY RUN for removing"} version: ${version}\n`
);

console.log(`Will unpublish (${unpublishable.length} leaves):`);
console.log(`  ${unpublishable.join(", ")}\n`);
console.log(`Will deprecate (${deprecateOnly.length} non-leaves, latest stable keeps dependents):`);
console.log(`  ${deprecateOnly.join(", ")}\n`);

// --- Check which packages have this version published ---

type Action = { short: string; mode: "unpublish" | "deprecate" };
const actions: Action[] = [];
let skipped = 0;

const allPackages = [
  ...unpublishable.map((s) => ({ short: s, mode: "unpublish" as const })),
  ...deprecateOnly.map((s) => ({ short: s, mode: "deprecate" as const })),
];

for (const { short, mode } of allPackages) {
  const name = `${SCOPE}/${short}`;
  process.stdout.write(`  ${name}@${version} ... `);

  let versions: string[] = [];
  try {
    const out = await $`npm view ${name} versions --json 2>&1`.quiet();
    const parsed = JSON.parse(out.stdout.toString());
    versions = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // not in registry
  }

  if (!versions.includes(version)) {
    console.log("skipped (not published)");
    skipped++;
    continue;
  }

  // For deprecate-mode, check if already deprecated
  if (mode === "deprecate") {
    try {
      const depOut = await $`npm view ${name}@${version} deprecated --json 2>&1`.quiet();
      const depValue = depOut.stdout.toString().trim();
      if (depValue && depValue !== '""' && depValue !== "undefined") {
        console.log("skipped (already deprecated)");
        skipped++;
        continue;
      }
    } catch {
      // not deprecated yet
    }
  }

  if (!isRun) {
    console.log(`would ${mode}`);
    actions.push({ short, mode });
  } else {
    console.log(`queued (${mode})`);
    actions.push({ short, mode });
  }
}

if (!isRun) {
  console.log(
    `\nDry run complete: ${actions.length} to remove, ${skipped} skipped.`
  );
  process.exit(0);
}

if (actions.length === 0) {
  console.log(`\nNothing to do — version ${version} not published anywhere.`);
  process.exit(0);
}

// --- Execute: unpublish leaves, deprecate the rest ---

let unpublishedCount = 0;
let deprecatedCount = 0;
let failed = 0;

const toUnpublish = actions.filter((a) => a.mode === "unpublish");
const toDeprecate = actions.filter((a) => a.mode === "deprecate");

if (toUnpublish.length > 0) {
  console.log(`\n--- Unpublishing ${toUnpublish.length} leaf packages ---\n`);

  for (const { short } of toUnpublish) {
    const name = `${SCOPE}/${short}`;
    process.stdout.write(`  ${name}@${version} ... `);

    try {
      await $`npm unpublish ${name}@${version} 2>&1`.quiet();
      console.log("unpublished");
      unpublishedCount++;
    } catch (e: any) {
      const output =
        (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
      console.log("FAILED");
      console.error(`    ${output.trim()}`);
      failed++;
    }
  }
}

if (toDeprecate.length > 0) {
  console.log(`\n--- Deprecating ${toDeprecate.length} non-leaf packages ---\n`);

  for (const { short } of toDeprecate) {
    const name = `${SCOPE}/${short}`;
    process.stdout.write(`  ${name}@${version} ... `);

    try {
      await $`npm deprecate -f "${name}@${version}" "use latest" 2>&1`.quiet();
      console.log("deprecated");
      deprecatedCount++;
    } catch (e2: any) {
      const out2 =
        (e2.stdout?.toString() || "") + (e2.stderr?.toString() || "");
      console.log("FAILED to deprecate");
      console.error(`    ${out2.trim()}`);
      failed++;
    }
  }
}

console.log(
  `\nDone: ${unpublishedCount} unpublished, ${deprecatedCount} deprecated, ${skipped} skipped, ${failed} failed.`
);

if (failed > 0) process.exit(1);
