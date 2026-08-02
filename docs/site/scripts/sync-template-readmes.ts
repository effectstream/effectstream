#!/usr/bin/env bun
// Sync each template's README.md into the docs site under
// docs/home/1200-templates/<position>-<slug>.md. The template README is the
// source of truth (see templates/README-FORMAT.md); this script writes a thin
// Docusaurus wrapper around it — frontmatter, a "generated" banner, copied
// screenshots and rewritten relative links — and regenerates the index page.
//
// Run via:
//   bun run scripts/sync-template-readmes.ts            # write
//   bun run scripts/sync-template-readmes.ts --check    # exit 1 if it would change anything
//
// Two things are deliberately automatic:
//
//   * Draft status. A template that still depends on the unpublished
//     `@paimaexample/*` scope cannot be installed, so its page is marked
//     `draft: true` and excluded from the production build. Migrating the
//     template to `@effectstream/*` publishes its page on the next sync —
//     there is no flag to remember to flip.
//
//   * Screenshots. Images under `templates/<dir>/docs/` are copied next to the
//     generated page and their links rewritten, so the same markdown renders
//     both on GitHub and on the docs site.
//
// Pages in this section that do NOT document a template — the wallets demo
// (which lives in e2e/) and the Tarochi case study — are hand-written and left
// alone; see HAND_WRITTEN below.

import { resolve, join, relative, basename } from "path";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  readdirSync, unlinkSync, copyFileSync,
} from "fs";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const TEMPLATES_DIR = resolve(REPO_ROOT, "templates");
const DOCS_OUT = resolve(import.meta.dir, "../docs/home/1200-templates");
const GH_BLOB = "https://github.com/effectstream/effectstream/blob/main";
const GH_TREE = "https://github.com/effectstream/effectstream/tree/main";

const GENERATED_MARKER = "Generated from templates/";

// Pages in this directory that are not generated from a template.
const HAND_WRITTEN = new Set([
  "1202-wallets.md",
  "1250-example-tarochi.md",
  "_category_.json",
]);

type Group = "start" | "multichain" | "game" | "chain" | "app";

const GROUPS: Record<Group, { label: string; blurb: string }> = {
  start: {
    label: "Starting points",
    blurb: "The smallest complete examples. Read these first.",
  },
  multichain: {
    label: "Multi-chain",
    blurb: "Templates that sync from, or settle across, more than one chain.",
  },
  game: {
    label: "Games",
    blurb: "Turn-based and real-time games built on the state machine.",
  },
  chain: {
    label: "Chain-specific",
    blurb: "Focused examples of one chain's primitives and tooling.",
  },
  app: {
    label: "Applications",
    blurb: "Commerce, batching and other non-game applications.",
  },
};

// Explicit registry. Slugs for pages that already existed are pinned so their
// published URLs do not change; `position` drives sidebar order independently
// of the filename, which lets the learning path start with `minimal` without
// renaming anything.
const TEMPLATES: {
  dir: string;
  slug: string;
  file: number;
  position: number;
  group: Group;
}[] = [
  { dir: "minimal",                    slug: "minimal",                    file: 1210, position: 1,  group: "start" },
  { dir: "hex-battle",                 slug: "hex-battle",                 file: 1211, position: 2,  group: "start" },

  { dir: "evm-midnight-v2",            slug: "evm-midnight",               file: 1201, position: 3,  group: "multichain" },
  { dir: "evm-cardano",                slug: "evm-cardano",                file: 1212, position: 4,  group: "multichain" },
  { dir: "zk-cardano",                 slug: "zk-cardano",                 file: 1213, position: 5,  group: "multichain" },
  { dir: "night-bitcoin-v2",           slug: "intent-swap",                file: 1205, position: 6,  group: "multichain" },
  { dir: "multi-chain-token-transfer", slug: "multi-chain-swap",           file: 1204, position: 7,  group: "multichain" },

  { dir: "chess-v2",                   slug: "chess",                      file: 1203, position: 8,  group: "game" },
  { dir: "world-map-2d",               slug: "world-map-2d",               file: 1206, position: 9,  group: "game" },
  { dir: "rock-paper-scissors",        slug: "rock-paper-scissors",        file: 1207, position: 10, group: "game" },
  { dir: "dice",                       slug: "dice",                       file: 1208, position: 11, group: "game" },
  { dir: "shinkai-v2",                 slug: "shinkai",                    file: 1214, position: 12, group: "game" },

  { dir: "solana-starter",             slug: "solana-starter",             file: 1215, position: 13, group: "chain" },
  { dir: "cardano-delegation",         slug: "cardano-delegation",         file: 1216, position: 14, group: "chain" },
  { dir: "projected-nft-preorder",     slug: "projected-nft-preorder",     file: 1217, position: 15, group: "chain" },
  { dir: "zswap-da",                   slug: "zswap-da",                   file: 1218, position: 16, group: "chain" },

  { dir: "preorder",                   slug: "preorder",                   file: 1219, position: 17, group: "app" },
  { dir: "batcher-validations",        slug: "batcher-validations",        file: 1220, position: 18, group: "app" },
];

/** A template pinned to the unpublished @paimaexample scope cannot be installed. */
function isLegacy(dir: string): boolean {
  const root = join(TEMPLATES_DIR, dir);
  const manifests: string[] = [];
  const rootPkg = join(root, "package.json");
  if (existsSync(rootPkg)) manifests.push(rootPkg);
  for (const sub of ["packages", "packages/shared", "packages/client"]) {
    const subDir = join(root, sub);
    if (!existsSync(subDir)) continue;
    for (const entry of readdirSync(subDir)) {
      const pkg = join(subDir, entry, "package.json");
      if (existsSync(pkg)) manifests.push(pkg);
    }
  }
  return manifests.some((m) => readFileSync(m, "utf-8").includes("@paimaexample"));
}

// Sections every template README must carry, in this order. Kept in sync with
// templates/README-FORMAT.md — the format is only "consistent" if something
// checks it, so `--check` fails the build when a README drifts from it.
const REQUIRED_SECTIONS = [
  "What this template shows",
  "Effectstream features used",
  "Quick start",
  "Project structure",
  "How it works",
  "Testing",
  "Where to go next",
] as const;

const SUMMARY_MAX = 160;

/**
 * True when a path is gitignored, i.e. a build artifact rather than a broken
 * reference. `packages/contracts-evm/mod.ts` and `build/` are generated by the
 * mod builder, so a README may point at them before they exist.
 */
function isGitIgnored(dir: string, relPath: string): boolean {
  const res = Bun.spawnSync({
    cmd: ["git", "check-ignore", "-q", join("templates", dir, relPath)],
    cwd: REPO_ROOT,
    stdout: "ignore",
    stderr: "ignore",
  });
  return res.exitCode === 0;
}

/**
 * Structural + factual validation of one template README.
 *
 * Factual here means "the things that actually drifted in practice": paths that
 * no longer exist and screenshots that were never committed. Both are cheap to
 * check and were the single largest category of error in the docs audit.
 */
function validateReadme(dir: string, markdown: string): string[] {
  const problems: string[] = [];

  if (!/^#\s+\S/.test(markdown)) problems.push("missing H1 title on the first line");

  const summary = extractSummary(markdown);
  if (!summary) {
    problems.push("missing the `> one sentence` summary blockquote under the H1");
  } else if (summary.length > SUMMARY_MAX) {
    problems.push(`summary is ${summary.length} chars, over the ${SUMMARY_MAX} limit`);
  }

  // Sections must all be present, and in the documented order.
  let cursor = -1;
  for (const section of REQUIRED_SECTIONS) {
    const idx = markdown.indexOf(`## ${section}`);
    if (idx === -1) {
      problems.push(`missing section "## ${section}"`);
      continue;
    }
    if (idx < cursor) problems.push(`section "## ${section}" is out of order`);
    cursor = idx;
  }

  if (markdown.includes("## Effectstream features used")) {
    const table = markdown
      .slice(markdown.indexOf("## Effectstream features used"))
      .split("\n## ")[0];
    if (!/\|\s*Feature\s*\|\s*Where\s*\|\s*Used for\s*\|/i.test(table)) {
      problems.push('"Effectstream features used" is missing its Feature|Where|Used for table');
    }
  }

  // Screenshots must exist where the README says they do.
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\.\/docs\/([^)]+)\)/g)) {
    if (!existsSync(join(TEMPLATES_DIR, dir, "docs", m[1]))) {
      problems.push(`referenced screenshot does not exist: docs/${m[1]}`);
    }
  }

  // Paths must resolve against the template root. Two classes are checked:
  //
  //   * link targets — `[label](./packages/x.ts)` — always, because they are
  //     clickable and a dead one is a broken link on the docs site;
  //   * bare backticked paths in prose, EXCEPT link labels (where the backticks
  //     are display text and the target beside them is what matters).
  //
  // Generated artifacts are skipped: a README may legitimately point at a file
  // that only exists after a build, and git already knows which those are.
  const linkLabelsStripped = markdown.replace(/\[`[^`]+`\]\(/g, "[](");

  const candidates = new Set<string>();
  for (const m of linkLabelsStripped.matchAll(
    /`((?:packages|src|contracts|scripts)\/[A-Za-z0-9._\/-]+)`/g,
  )) {
    candidates.add(m[1]);
  }
  for (const m of markdown.matchAll(/\]\(\.\/((?:packages|src|contracts|scripts)\/[^)#]+)\)/g)) {
    candidates.add(m[1]);
  }

  // A README sometimes needs to name a path that genuinely does not exist — a
  // layout the template predates, or a script whose target is missing and that
  // the README is documenting AS missing. Those are declared explicitly:
  //
  //   <!-- allow-missing: packages/node -->
  //
  // which keeps the exception visible in the source rather than silently
  // weakening the check for everyone.
  const allowed = new Set(
    [...markdown.matchAll(/<!--\s*allow-missing:\s*([^\s>]+)\s*-->/g)].map((m) => m[1]),
  );

  for (const raw of candidates) {
    const p = raw.replace(/\/$/, "");
    if (p.includes("*") || p.includes("<")) continue;
    if (allowed.has(p)) continue;
    if (existsSync(join(TEMPLATES_DIR, dir, p))) continue;
    if (isGitIgnored(dir, p)) continue; // generated at build time
    problems.push(
      `path does not exist in the template: ${p}` +
        ` (if that is deliberate, add <!-- allow-missing: ${p} -->)`,
    );
  }

  return problems;
}

/** First blockquote line after the H1 — the template's one-sentence summary. */
function extractSummary(markdown: string): string {
  const m = markdown.match(/^#\s+[^\n]+\n+>\s*([^\n]+)/);
  return m ? m[1].trim() : "";
}

function extractTitle(markdown: string): string {
  const m = markdown.match(/^#\s+([^\n]+)/);
  return m ? m[1].trim() : "";
}

/**
 * Copy `templates/<dir>/docs/*` referenced by the README next to the generated
 * page and rewrite the links. Runs before rewriteLinks so screenshots do not
 * get turned into GitHub blob URLs, which do not render as images.
 */
function relocateImages(
  markdown: string,
  dir: string,
  slug: string,
  write: boolean,
): { text: string; images: string[] } {
  const images: string[] = [];
  // Relocated images are parked behind a sentinel so the generic relative-link
  // rewrite below cannot touch them — it would otherwise turn the freshly
  // copied `./slug-file.png` into a GitHub blob URL, which does not render.
  const text = markdown.replace(/!\[([^\]]*)\]\(\.\/docs\/([^)]+)\)/g, (_m, alt, file) => {
    const src = join(TEMPLATES_DIR, dir, "docs", file);
    const destName = `${slug}-${basename(file)}`;
    if (existsSync(src) && write) copyFileSync(src, join(DOCS_OUT, destName));
    images.push(`![${alt}](./${destName})`);
    return `%%ES_IMG_${images.length - 1}%%`;
  });
  return { text, images };
}

function restoreImages(markdown: string, images: string[]): string {
  return markdown.replace(/%%ES_IMG_(\d+)%%/g, (_m, i) => images[Number(i)] ?? "");
}

/**
 * MDX parses `<http://…>` as JSX and fails on the slash, so plain autolinks
 * that are valid GitHub markdown break the docs build. Convert them to real
 * markdown links, which render identically in both places.
 */
function expandAutolinks(markdown: string): string {
  return markdown.replace(/<(https?:\/\/[^>\s]+)>/g, "[$1]($1)");
}

/** Relative links resolve against the template dir and point at GitHub. */
function rewriteLinks(markdown: string, dir: string): string {
  return markdown.replace(/\]\((\.{1,2}\/[^)]+)\)/g, (_m, target) => {
    const cleaned = target.split("#")[0];
    const hash = target.slice(cleaned.length);
    const resolved = relative(REPO_ROOT, resolve(TEMPLATES_DIR, dir, cleaned));
    const isFile = /\.[a-z0-9]+$/i.test(cleaned);
    return `](${isFile ? GH_BLOB : GH_TREE}/${resolved}${hash})`;
  });
}

function generatePage(t: (typeof TEMPLATES)[number]): { path: string; body: string } {
  const readmePath = join(TEMPLATES_DIR, t.dir, "README.md");
  const readme = readFileSync(readmePath, "utf-8");
  const title = extractTitle(readme);
  const summary = extractSummary(readme);
  const legacy = isLegacy(t.dir);

  // Strip the H1 and the summary blockquote — both are lifted into frontmatter.
  let body = readme.replace(/^#\s+[^\n]+\n+/, "");
  body = body.replace(/^>\s*[^\n]+\n+/, "");
  const relocated = relocateImages(body, t.dir, t.slug, true);
  body = rewriteLinks(relocated.text, t.dir);
  body = restoreImages(body, relocated.images);
  body = expandAutolinks(body);

  const front = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `description: "${summary.replace(/"/g, '\\"')}"`,
    `sidebar_label: "${title.replace(/"/g, '\\"')}"`,
    `sidebar_position: ${t.position}`,
    ...(legacy ? ["draft: true"] : []),
    "---",
  ].join("\n");

  const source = `${GH_TREE}/templates/${t.dir}`;
  const banner =
    `<!-- ${GENERATED_MARKER}${t.dir}/README.md by docs/site/scripts/sync-template-readmes.ts. Do not edit directly. -->\n\n` +
    `> Template: **[\`templates/${t.dir}\`](${source})**\n`;

  return {
    path: join(DOCS_OUT, `${t.file}-${t.slug}.md`),
    body: `${front}\n\n${banner}\n${body.trim()}\n`,
  };
}

function generateIndex(): { path: string; body: string } {
  const lines: string[] = [
    "---",
    'title: "Templates"',
    'description: "Starter projects covering every chain and pattern Effectstream supports."',
    "sidebar_position: 0",
    "---",
    "",
    `<!-- Generated by docs/site/scripts/sync-template-readmes.ts. Do not edit directly. -->`,
    "",
    "# Templates",
    "",
    "Every template is a standalone Bun monorepo you can clone and run. They share one flat layout, so moving between them is mostly a matter of which packages are present.",
    "",
    "Each page below is generated from that template's own README, so what you read here is what ships in the repository.",
    "",
  ];

  for (const group of Object.keys(GROUPS) as Group[]) {
    const members = TEMPLATES.filter((t) => t.group === group);
    if (!members.length) continue;
    lines.push(`## ${GROUPS[group].label}`, "", GROUPS[group].blurb, "");
    lines.push("| Template | What it shows |", "| --- | --- |");
    for (const t of members) {
      const readme = join(TEMPLATES_DIR, t.dir, "README.md");
      const summary = existsSync(readme) ? extractSummary(readFileSync(readme, "utf-8")) : "";
      const legacy = isLegacy(t.dir);
      // Draft pages are excluded from the build, so linking to them would fail
      // the build; point at the template on GitHub instead.
      const link = legacy
        ? `[\`${t.dir}\`](${GH_TREE}/templates/${t.dir})`
        : `[${t.dir}](./${t.slug}.md)`;
      const note = legacy ? " _(legacy — not installable)_" : "";
      lines.push(`| ${link}${note} | ${summary} |`);
    }
    lines.push("");
  }

  lines.push(
    "## Also in this section",
    "",
    "| Page | What it covers |",
    "| --- | --- |",
    "| [Wallet integrations](./wallets.md) | Every supported wallet mode, demonstrated by the `e2e/wallets-ui` app. |",
    "| [Tarochi (case study)](./example-tarochi.md) | A production game built on Effectstream. Not a template in this repository. |",
    "",
  );

  return { path: join(DOCS_OUT, "1200-templates.md"), body: lines.join("\n") };
}

function listGenerated(): string[] {
  if (!existsSync(DOCS_OUT)) return [];
  return readdirSync(DOCS_OUT)
    .filter((f) => f.endsWith(".md") && !HAND_WRITTEN.has(f))
    .map((f) => join(DOCS_OUT, f))
    .filter((p) => {
      const c = readFileSync(p, "utf-8");
      return c.includes(GENERATED_MARKER) || c.includes("Generated by docs/site/scripts/sync-template-readmes.ts");
    });
}

async function main() {
  const isCheck = process.argv.includes("--check");
  mkdirSync(DOCS_OUT, { recursive: true });

  const missing: string[] = [];
  const invalid: string[] = [];
  const pages: { path: string; body: string }[] = [];

  for (const t of TEMPLATES) {
    const readme = join(TEMPLATES_DIR, t.dir, "README.md");
    if (!existsSync(readme)) {
      missing.push(`templates/${t.dir}/README.md`);
      continue;
    }
    const problems = validateReadme(t.dir, readFileSync(readme, "utf-8"));
    if (problems.length) {
      invalid.push(`templates/${t.dir}/README.md`);
      console.error(`\n${t.dir}:`);
      for (const p of problems) console.error(`  - ${p}`);
    }
    pages.push(generatePage(t));
  }
  pages.push(generateIndex());

  // Any template directory not in the registry is a silent gap — surface it.
  const known = new Set(TEMPLATES.map((t) => t.dir));
  const unregistered = readdirSync(TEMPLATES_DIR)
    .filter((e) => existsSync(join(TEMPLATES_DIR, e, "README.md")) && !known.has(e));

  let changed = 0;
  for (const { path, body } of pages) {
    const prev = existsSync(path) ? readFileSync(path, "utf-8") : null;
    if (prev === body) continue;
    changed++;
    if (!isCheck) writeFileSync(path, body);
  }

  // Remove generated pages whose template left the registry.
  const expected = new Set(pages.map((p) => p.path));
  for (const stale of listGenerated()) {
    if (expected.has(stale)) continue;
    changed++;
    if (!isCheck) unlinkSync(stale);
  }

  if (missing.length) {
    console.error(`Missing README for ${missing.length} template(s):`);
    for (const m of missing) console.error(`  ${m}`);
  }
  if (unregistered.length) {
    console.error(
      `Template(s) not in the registry in this script: ${unregistered.join(", ")}`,
    );
  }

  const drafts = TEMPLATES.filter((t) => isLegacy(t.dir)).map((t) => t.dir);

  if (isCheck) {
    if (changed || missing.length || unregistered.length || invalid.length) {
      const reasons = [
        changed ? `${changed} doc(s) out of date` : "",
        missing.length ? `${missing.length} missing README(s)` : "",
        invalid.length ? `${invalid.length} README(s) failing the format` : "",
        unregistered.length ? `${unregistered.length} unregistered template(s)` : "",
      ].filter(Boolean);
      console.error(`\nCheck failed: ${reasons.join(", ")}.`);
      console.error("See templates/README-FORMAT.md for the required structure.");
      process.exit(1);
    }
    console.log(`Check passed: all ${TEMPLATES.length} template docs up to date and valid.`);
    return;
  }

  if (missing.length || unregistered.length || invalid.length) process.exit(1);
  console.log(
    `Synced ${TEMPLATES.length} template readmes (${drafts.length} draft: ${drafts.join(", ")}).`,
  );
}

await main();
