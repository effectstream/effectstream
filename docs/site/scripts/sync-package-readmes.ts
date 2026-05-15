#!/usr/bin/env bun
// Sync each publishable package's README.md into the docs site under
// docs/home/500-packages/<category>/<slug>.md. The package README is the
// source of truth; this script writes a thin Docusaurus wrapper around it
// (frontmatter + a "generated" banner + rewritten relative links).
//
// Run via:
//   bun run scripts/sync-package-readmes.ts            # write
//   bun run scripts/sync-package-readmes.ts --check    # exit 1 if it would change anything
//
// Categorization is driven by the package's path under packages/:
//   effectstream-sdk/* -> 510-sdk
//   node-sdk/*         -> 520-node
//   chains/*           -> 530-chains
//   binaries/*         -> 540-binaries
//   batcher, frontend, build-tools/* -> 550-tools
//
// Packages with package.json `"private": true` and a small DEPRECATED set
// are skipped.

import { resolve, join, relative, dirname } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { Glob } from "bun";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const DOCS_OUT = resolve(import.meta.dir, "../docs/home/500-packages");
const GH_BLOB = "https://github.com/PaimaStudios/paima-engine/blob/main";
const GH_TREE = "https://github.com/PaimaStudios/paima-engine/tree/main";

const DEPRECATED = new Set(["@effectstream/explorer"]);
const CATEGORIES = {
  sdk: { dir: "510-sdk", label: "SDK" },
  node: { dir: "520-node", label: "Node SDK" },
  chains: { dir: "530-chains", label: "Chains" },
  binaries: { dir: "540-binaries", label: "Binaries" },
  tools: { dir: "550-tools", label: "Tools" },
} as const;

type Category = keyof typeof CATEGORIES;

function categorize(relDir: string): Category {
  if (relDir.startsWith("packages/effectstream-sdk/")) return "sdk";
  if (relDir.startsWith("packages/node-sdk/")) return "node";
  if (relDir.startsWith("packages/chains/")) return "chains";
  if (relDir.startsWith("packages/binaries/")) return "binaries";
  return "tools";
}

function slug(pkgName: string): string {
  // @effectstream/foo -> foo; @effectstream/npm-foo -> foo
  return pkgName.replace(/^@effectstream\//, "").replace(/^npm-/, "");
}

type PkgInfo = {
  name: string;
  dir: string;
  relDir: string;
  category: Category;
  pkg: any;
  readmePath: string;
};

async function discover(): Promise<PkgInfo[]> {
  const glob = new Glob("packages/**/package.json");
  const out: PkgInfo[] = [];
  for await (const path of glob.scan({ cwd: REPO_ROOT })) {
    if (path.includes("node_modules")) continue;
    const fullPath = resolve(REPO_ROOT, path);
    const pkg = JSON.parse(readFileSync(fullPath, "utf-8"));
    if (!pkg.name) continue;
    if (pkg.private) continue;
    if (DEPRECATED.has(pkg.name)) continue;
    const dir = dirname(fullPath);
    const relDir = relative(REPO_ROOT, dir);
    out.push({
      name: pkg.name,
      dir,
      relDir,
      category: categorize(relDir),
      pkg,
      readmePath: join(dir, "README.md"),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function rewriteLinks(markdown: string, relDir: string): string {
  // Rewrite relative links (./foo, ../foo) to absolute GitHub URLs so they
  // resolve when the README is rendered out of context.
  return markdown.replace(/\]\((\.{1,2}\/[^)]+)\)/g, (_match, target) => {
    const cleaned = target.split("#")[0];
    const hash = target.slice(cleaned.length);
    const resolved = relative(REPO_ROOT, resolve(REPO_ROOT, relDir, cleaned));
    // Files vs directories — heuristic: ends with extension -> blob; else tree
    const isFile = /\.[a-z0-9]+$/i.test(cleaned);
    const base = isFile ? GH_BLOB : GH_TREE;
    return `](${base}/${resolved}${hash})`;
  });
}

function generateDocPage(info: PkgInfo): string {
  const readme = readFileSync(info.readmePath, "utf-8");
  const description = info.pkg.description || "";

  // Strip a leading H1 from the README — we render the package name in the
  // frontmatter title, and Docusaurus would otherwise duplicate it.
  const body = readme.replace(/^#\s+[^\n]+\n+/, "");
  const rewritten = rewriteLinks(body, info.relDir);

  const sourceUrl = `${GH_TREE}/${info.relDir}`;
  const npmUrl = `https://www.npmjs.com/package/${info.name}`;

  return `---
title: "${info.name}"
description: "${description.replace(/"/g, '\\"')}"
sidebar_label: "${slug(info.name)}"
---

{/* Generated from ${info.relDir}/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[\`${info.name}\`](${npmUrl})** · [Source](${sourceUrl})

${rewritten.trim()}
`;
}

function ensureCategoryIndex(category: Category): void {
  const { dir, label } = CATEGORIES[category];
  const path = join(DOCS_OUT, dir, "_category_.json");
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        label,
        collapsible: true,
        collapsed: true,
        link: { type: "generated-index" },
      },
      null,
      2,
    ) + "\n",
  );
}

function listGenerated(): string[] {
  if (!existsSync(DOCS_OUT)) return [];
  const out: string[] = [];
  for (const cat of Object.values(CATEGORIES)) {
    const catDir = join(DOCS_OUT, cat.dir);
    if (!existsSync(catDir)) continue;
    for (const entry of readdirSync(catDir)) {
      if (!entry.endsWith(".md")) continue;
      const full = join(catDir, entry);
      const content = readFileSync(full, "utf-8");
      if (content.includes("Generated from packages/")) out.push(full);
    }
  }
  return out;
}

async function main() {
  const isCheck = process.argv.includes("--check");
  const pkgs = await discover();
  const missing: string[] = [];
  const written = new Set<string>();
  let diffCount = 0;

  for (const info of pkgs) {
    if (!existsSync(info.readmePath)) {
      missing.push(info.name);
      continue;
    }
    ensureCategoryIndex(info.category);
    const outDir = join(DOCS_OUT, CATEGORIES[info.category].dir);
    const outPath = join(outDir, `${slug(info.name)}.md`);
    written.add(outPath);

    const next = generateDocPage(info);
    const prev = existsSync(outPath) ? readFileSync(outPath, "utf-8") : "";
    if (next === prev) continue;
    diffCount++;
    if (isCheck) {
      console.error(`  drift: ${relative(REPO_ROOT, outPath)}`);
      continue;
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, next);
    console.log(`  wrote: ${relative(REPO_ROOT, outPath)}`);
  }

  // Clean up stale generated pages
  for (const stale of listGenerated()) {
    if (written.has(stale)) continue;
    diffCount++;
    if (isCheck) {
      console.error(`  stale: ${relative(REPO_ROOT, stale)}`);
      continue;
    }
    unlinkSync(stale);
    console.log(`  removed: ${relative(REPO_ROOT, stale)}`);
  }

  if (missing.length) {
    console.error(`\nMissing READMEs in ${missing.length} package(s):`);
    for (const n of missing) console.error(`  - ${n}`);
    if (!process.argv.includes("--allow-missing")) {
      console.error(
        `\nAdd README.md to each package or pass --allow-missing to skip.`,
      );
      process.exit(1);
    }
  }

  if (isCheck && diffCount > 0) {
    console.error(
      `\n${diffCount} file(s) out of sync. Run \`bun run sync-readmes\` and commit the result.`,
    );
    process.exit(1);
  }

  if (!isCheck) {
    console.log(
      `\nSynced ${pkgs.length - missing.length}/${pkgs.length} package readmes.`,
    );
  } else {
    console.log(`Check passed: all ${pkgs.length} package docs up to date.`);
  }
}

main();
