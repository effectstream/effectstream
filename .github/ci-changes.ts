#!/usr/bin/env bun
/**
 * CI change classifier. Decides which jobs the GitHub workflow should run based
 * on the files changed in the push / PR, and writes the result to $GITHUB_OUTPUT:
 *
 *   core=true|false                 # run the Docker e2e suite
 *   templates=<space-separated>     # enabled template names whose dir changed
 *   singleFile=true|false           # run the single-file template controller
 *
 * `core` is true when `packages/**` or `e2e/**` change, plus the build-infra
 * files the e2e image itself depends on (so a Dockerfile / lockfile change still
 * re-runs e2e). `templates` is the set of changed `templates/<name>/...` dirs
 * intersected with the ENABLED list in templates/run-template-tests.ts — the
 * single source of truth. Unknown / disabled templates drop out here, so a push
 * touching only those produces an empty list and the template job is skipped.
 *
 * `singleFile` exists because `templates/single-file` is deliberately NOT in
 * that ENABLED list: it is a registry-only two-file consumer with its own
 * external controller (templates/test-single-file.ts) rather than a
 * `bun run test` script, so `templates` would silently drop it and its
 * regression test would never run. This flag selects it explicitly, and also
 * fires for the supporting files that can break it without touching its own
 * directory — the controller itself and the manifest updater.
 *
 * The diff range mirrors GitHub's PR "Files changed" view — only a branch's own
 * delta, never code it merely merged in from the default branch:
 *   - pull_request             → three-dot base...head
 *   - push to a feature branch → three-dot vs the default branch's merge-base
 *       (DEFAULT_BRANCH / HEAD_REF env). Diffing against `before` would be wrong
 *       here: on a "merge default into branch" push `before` is an ancestor of
 *       the merge commit, so before..after still contains everything the merge
 *       pulled in.
 *   - push to an allowlisted long-lived branch → two-arg before..after
 *       (BASE_SHA/HEAD_SHA). Both v-next and midnight-1 are mainlines; comparing
 *       the divergent maintenance line against v-next would select its entire
 *       history on every push.
 * If the base is unusable (new branch, force-push) on a path that needs it, or
 * any git call fails, we fall back to running everything — over-run rather than
 * miss a real change.
 */
import { ENABLED } from "../templates/run-template-tests.ts";

export interface ChangeClassification {
  core: boolean;
  templates: string[];
  singleFile: boolean;
}

/** Top-level path prefixes that, if touched, require the full e2e suite. */
const CORE_PREFIXES = ["packages/", "e2e/"] as const;

/** The distributed single-file template. Any change inside it selects the job. */
const SINGLE_FILE_PREFIX = "templates/single-file/";

/**
 * Files outside `templates/single-file/` that can break it. The template
 * installs its dependencies from the public registry, so `packages/**` cannot
 * — but its own controller and the script that rewrites its manifest can.
 * `.github/ci-changes.ts` and the workflow are included so a change to the
 * selection logic re-proves the job it selects.
 */
const SINGLE_FILE_FILES = new Set<string>([
  "templates/test-single-file.ts",
  "templates/update-packages.ts",
  ".github/ci-changes.ts",
  ".github/workflows/main.yaml",
]);

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
  let singleFile = false;

  for (const raw of files) {
    const f = raw.trim();
    if (!f) continue;

    if (CORE_PREFIXES.some((p) => f.startsWith(p)) || CORE_FILES.has(f)) {
      core = true;
    }

    if (f.startsWith(SINGLE_FILE_PREFIX) || SINGLE_FILE_FILES.has(f)) {
      singleFile = true;
    }

    // templates/<name>/<something> — the trailing `/.+` requires a file *inside*
    // a template dir, so top-level shared files (templates/check.sh,
    // templates/run-template-tests.ts, templates/*.md) never match.
    const m = /^templates\/([^/]+)\/.+/.exec(f);
    if (m && enabledSet.has(m[1])) templates.add(m[1]);
  }

  return { core, templates: [...templates].sort(), singleFile };
}

const ZERO_SHA = "0000000000000000000000000000000000000000";
export const REQUIRED_LONG_LIVED_BRANCHES = ["v-next", "midnight-1"] as const;

/**
 * Parse the workflow-owned mainline allowlist. Fail closed unless it names the
 * exact two approved branches once each; event data cannot add another branch.
 */
export function parseLongLivedBranches(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const branches = raw.split(",").map((branch) => branch.trim());
  if (
    branches.some((branch) => !branch || !/^[A-Za-z0-9._/-]+$/.test(branch)) ||
    new Set(branches).size !== branches.length ||
    branches.length !== REQUIRED_LONG_LIVED_BRANCHES.length ||
    REQUIRED_LONG_LIVED_BRANCHES.some((branch) => !branches.includes(branch))
  ) {
    return null;
  }
  return branches;
}

/** True when we can't trust the base SHA and should just run everything. */
export function baseIsUnusable(base: string | undefined): boolean {
  return !base || base === ZERO_SHA || /^0+$/.test(base);
}

/**
 * Pick the `git` argv (everything after `git`) for collecting changed files.
 * Pure — exported for unit testing.
 *
 *   - pull_request             → three-dot base...head: what the PR adds.
 *   - push to a feature branch → three-dot against the default branch's fork
 *       point, via FETCH_HEAD (the caller must fetch the default branch first).
 *       Diffing against `before` would be wrong: on a "merge default into
 *       branch" push `before` is an ancestor of the merge commit, so the
 *       before..after range still contains everything the merge pulled in.
 *   - push to the default branch → two-arg before..after: the commits that just
 *       landed on mainline (no branch delta to isolate).
 */
export function diffArgs(opts: {
  eventName: string;
  base: string;
  head: string;
  headRef: string;
  defaultBranch: string;
  longLivedBranches: readonly string[];
}): string[] {
  const { eventName, base, head, headRef, longLivedBranches } = opts;
  if (eventName === "pull_request") {
    return ["diff", "--name-only", `${base}...${head}`];
  }
  if (longLivedBranches.includes(headRef)) {
    return ["diff", "--name-only", base, head];
  }
  return ["diff", "--name-only", `FETCH_HEAD...${head}`];
}

/** Collect the changed files via git, or return null if the diff can't be run. */
function changedFiles(
  eventName: string,
  base: string,
  head: string,
  headRef: string,
  defaultBranch: string,
  longLivedBranches: readonly string[],
): string[] | null {
  // Feature-branch push: fetch the default branch so the three-dot diff has a
  // FETCH_HEAD to resolve its merge-base against.
  if (eventName !== "pull_request" && !longLivedBranches.includes(headRef)) {
    const fetched = Bun.spawnSync(
      ["git", "fetch", "--no-tags", "origin", defaultBranch],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (fetched.exitCode !== 0) {
      console.error(
        `git fetch origin ${defaultBranch} failed:\n${fetched.stderr.toString().trim()}`,
      );
      return null;
    }
  }

  const args = diffArgs({
    eventName,
    base,
    head,
    headRef,
    defaultBranch,
    longLivedBranches,
  });
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
  const headRef = process.env.HEAD_REF ?? "";
  const defaultBranch = process.env.DEFAULT_BRANCH ?? "";
  const longLivedBranches = parseLongLivedBranches(
    process.env.LONG_LIVED_BRANCHES,
  );

  // A feature-branch push diffs against the default branch's merge-base, so it
  // never reads `before` and the unusable-base fallback doesn't apply to it.
  const featureBranchPush =
    eventName !== "pull_request" &&
    !!defaultBranch &&
    longLivedBranches !== null &&
    !longLivedBranches.includes(headRef);

  let result: ChangeClassification;
  let files: string[] | null = null;

  if (longLivedBranches === null) {
    console.log("Missing or malformed LONG_LIVED_BRANCHES — running everything.");
    result = { core: true, templates: [...ENABLED].sort(), singleFile: true };
  } else if (!featureBranchPush && baseIsUnusable(base)) {
    console.log(
      `No usable base SHA (BASE_SHA=${JSON.stringify(base)}) — running everything.`,
    );
    result = { core: true, templates: [...ENABLED].sort(), singleFile: true };
  } else {
    files = changedFiles(
      eventName,
      base ?? "",
      head,
      headRef,
      defaultBranch,
      longLivedBranches,
    );
    if (files === null) {
      console.log("git diff failed — running everything to be safe.");
      result = { core: true, templates: [...ENABLED].sort(), singleFile: true };
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
  console.log(`singleFile=${result.singleFile}`);

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    const { appendFileSync } = await import("fs");
    appendFileSync(
      out,
      `core=${result.core}\ntemplates=${
        result.templates.join(" ")
      }\nsingleFile=${result.singleFile}\n`,
    );
  }
}
