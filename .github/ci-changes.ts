#!/usr/bin/env bun
/**
 * CI change classifier. Decides which jobs the GitHub workflow should run based
 * on the files changed in the push / PR, and writes the result to $GITHUB_OUTPUT:
 *
 *   core=true|false                 # run the Docker e2e suite
 *   templates=<space-separated>     # enabled template names whose dir changed
 *
 * `core` is true when `packages/**` or `e2e/**` change, plus the build-infra
 * files the e2e image itself depends on (so a Dockerfile / lockfile change still
 * re-runs e2e). `templates` is the set of changed `templates/<name>/...` dirs
 * intersected with the ENABLED list in templates/run-template-tests.ts — the
 * single source of truth. Unknown / disabled templates drop out here, so a push
 * touching only those produces an empty list and the template job is skipped.
 *
 * Base/head come from BASE_SHA/HEAD_SHA env (injected by the workflow). If the
 * base is missing or all-zeros (new branch, force-push) or the diff fails, we
 * fall back to running everything — over-run rather than miss a real change.
 */
import { ENABLED } from "../templates/run-template-tests.ts";

export interface ChangeClassification {
  core: boolean;
  templates: string[];
}

/** Top-level path prefixes that, if touched, require the full e2e suite. */
const CORE_PREFIXES = ["packages/", "e2e/"] as const;

/**
 * Exact root-relative files the e2e build depends on. Changing any of these can
 * alter the test environment, so they trigger e2e even though they live outside
 * packages/ and e2e/.
 */
const CORE_FILES = new Set<string>([
  ".github/Dockerfile",
  ".github/run-e2e.sh",
  ".github/ci-changes.ts",
  ".github/workflows/main.yaml",
  "patch.sh",
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "orchestrator.config.ts",
]);

/**
 * Pure classifier — given a list of changed (root-relative, forward-slash)
 * paths and the enabled-template list, return which jobs to run. Exported for
 * unit testing; no I/O.
 */
export function classify(
  files: string[],
  enabled: readonly string[],
): ChangeClassification {
  const enabledSet = new Set(enabled);
  const templates = new Set<string>();
  let core = false;

  for (const raw of files) {
    const f = raw.trim();
    if (!f) continue;

    if (CORE_PREFIXES.some((p) => f.startsWith(p)) || CORE_FILES.has(f)) {
      core = true;
    }

    // templates/<name>/<something> — the trailing `/.+` requires a file *inside*
    // a template dir, so top-level shared files (templates/check.sh,
    // templates/run-template-tests.ts, templates/*.md) never match.
    const m = /^templates\/([^/]+)\/.+/.exec(f);
    if (m && enabledSet.has(m[1])) templates.add(m[1]);
  }

  return { core, templates: [...templates].sort() };
}

const ZERO_SHA = "0000000000000000000000000000000000000000";

/** True when we can't trust the base SHA and should just run everything. */
function baseIsUnusable(base: string | undefined): boolean {
  return !base || base === ZERO_SHA || /^0+$/.test(base);
}

/** Collect the changed files via git, or return null if the diff can't be run. */
function changedFiles(
  eventName: string,
  base: string,
  head: string,
): string[] | null {
  // PR: diff against the merge-base (three-dot) to get only what the PR adds.
  // push: plain two-arg diff between the before/after commits.
  const args =
    eventName === "pull_request"
      ? ["diff", "--name-only", `${base}...${head}`]
      : ["diff", "--name-only", base, head];

  const proc = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    console.error(
      `git ${args.join(" ")} failed:\n${proc.stderr.toString().trim()}`,
    );
    return null;
  }
  return proc.stdout.toString().split("\n").filter(Boolean);
}

if (import.meta.main) {
  const eventName = process.env.EVENT_NAME ?? "push";
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA ?? "HEAD";

  let result: ChangeClassification;
  let files: string[] | null = null;

  if (baseIsUnusable(base)) {
    console.log(
      `No usable base SHA (BASE_SHA=${JSON.stringify(base)}) — running everything.`,
    );
    result = { core: true, templates: [...ENABLED].sort() };
  } else {
    files = changedFiles(eventName, base!, head);
    if (files === null) {
      console.log("git diff failed — running everything to be safe.");
      result = { core: true, templates: [...ENABLED].sort() };
    } else {
      result = classify(files, ENABLED);
    }
  }

  if (files) {
    console.log(`Changed files (${files.length}):`);
    for (const f of files) console.log(`  ${f}`);
  }
  console.log(`\ncore=${result.core}`);
  console.log(`templates=${result.templates.join(" ")}`);

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    const { appendFileSync } = await import("fs");
    appendFileSync(
      out,
      `core=${result.core}\ntemplates=${result.templates.join(" ")}\n`,
    );
  }
}
