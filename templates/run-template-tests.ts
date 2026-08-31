/**
 * Runs `bun run test` in each enabled template, serially (they share ports).
 * Prints a pass/fail summary at the end.
 *
 * Usage:
 *   bun run templates/run-template-tests.ts                      # all enabled
 *   bun run templates/run-template-tests.ts preorder shinkai-v2   # specific ones
 *
 * Flags:
 *   --skip-disabled  If explicit template args are given but none are ENABLED,
 *                    exit 0 (skip) instead of 1. Used by CI so a push touching
 *                    only a disabled/unknown template passes. The ENABLED array
 *                    is `export`ed so CI (.github/ci-changes.ts) can filter
 *                    changed templates against it without running this file.
 *
 * Env:
 *   LINK_LOCAL=1   After `bun install`, run each template's ./link.sh so the
 *                  tests resolve @effectstream/* to the local monorepo build
 *                  instead of the published packages. Every selected template
 *                  MUST have a link.sh or the run aborts before any tests run.
 *                  Also runs `bun install` at the monorepo root up front, since
 *                  the linked orchestrator resolves some deps from the root
 *                  workspace's node_modules.
 *   LINK_RUNTIME_ONLY=1
 *                  Overlay local runtime source onto installed workspace
 *                  @effectstream/runtime packages. CI uses this for atomic
 *                  runtime API + template changes while preserving every
 *                  published dependency version and module identity.
 */
import { exit } from "process";
import fs from "fs";
import path from "path";

const __dirname = import.meta.dirname!;

const LINK_LOCAL = ["1", "true", "yes"].includes(
  (process.env.LINK_LOCAL ?? "").toLowerCase(),
);
const LINK_RUNTIME_ONLY = ["1", "true", "yes"].includes(
  (process.env.LINK_RUNTIME_ONLY ?? "").toLowerCase(),
);

export const ENABLED = [
  "cardano-delegation",
  "evm-cardano",
  "evm-midnight-v2",
  "preorder",
  "projected-nft-preorder",
  "shinkai-v2",
  "zk-cardano",
  "batcher-validations",
  "night-bitcoin-v2",
  "hex-battle",
  "solana-starter",
  "chess-v2",
  // "chess",           // TODO: migrate to effectstream-bun
  // "dice",            // TODO: migrate to effectstream-bun
  // "evm-midnight",    // TODO: migrate to effectstream-bun
  "minimal",
  // "multi-chain-token-transfer", // TODO: migrate to effectstream-bun
  // "rock-paper-scissors", // TODO: migrate to effectstream-bun
  // "zswap-da",         // Frontend-only since 3fae2d91 extracted the backend to
  //                     // github.com/effectstream/zswap-offerfiles-kernel. It now
  //                     // installs and builds standalone (contract compiled from
  //                     // src/contract/offer-files.compact; the out-of-repo `file:`
  //                     // dep and the missing link.sh are both fixed), but there is
  //                     // still no meaningful `test`: exercising it needs that
  //                     // backend live on :9999 for Midnight config, ZK assets and
  //                     // the batcher, which CI can't stand up. A typecheck-only
  //                     // smoke test is the realistic way back in.
  "world-map-2d",
];

interface Result {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Bun installs workspace dependencies beneath each package's node_modules.
 * A template link.sh replaces the root @effectstream links, but those nearer
 * workspace links still win module resolution. Mirror each local root link
 * over an existing workspace dependency so LINK_LOCAL actually reaches the
 * node, database, frontend, and test packages without injecting undeclared
 * dependencies.
 */
function fanOutEffectstreamLinks(dir: string): number {
  const rootScope = path.join(dir, "node_modules", "@effectstream");
  const packagesDir = path.join(dir, "packages");
  if (!fs.existsSync(rootScope) || !fs.existsSync(packagesDir)) return 0;

  const localLinks = fs
    .readdirSync(rootScope, { withFileTypes: true })
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      target: fs.realpathSync(path.join(rootScope, entry.name)),
    }));

  let linked = 0;
  for (const workspace of fs.readdirSync(packagesDir, {
    withFileTypes: true,
  })) {
    if (!workspace.isDirectory()) continue;
    const workspaceScope = path.join(
      packagesDir,
      workspace.name,
      "node_modules",
      "@effectstream",
    );
    if (!fs.existsSync(workspaceScope)) continue;

    for (const local of localLinks) {
      const destination = path.join(workspaceScope, local.name);
      try {
        fs.lstatSync(destination);
      } catch {
        continue;
      }
      fs.rmSync(destination, { recursive: true, force: true });
      fs.symlinkSync(local.target, destination, "dir");
      linked++;
    }
  }
  return linked;
}

/**
 * Overlay local source onto direct, already-installed workspace runtime
 * packages. Keeping each installed package in place preserves its published
 * dependency graph; symlinking the monorepo package would also pull in its local
 * workspace dependencies and create distinct Vite/WASM module identities.
 */
function overlayRuntimeSource(dir: string): {
  links: number;
  targets: number;
} {
  const runtimeSource = path.join(
    __dirname,
    "..",
    "packages",
    "node-sdk",
    "runtime",
    "src",
  );
  const workspaceRoots = [dir];
  const packagesDir = path.join(dir, "packages");
  if (fs.existsSync(packagesDir)) {
    workspaceRoots.push(
      ...fs
        .readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(packagesDir, entry.name)),
    );
  }

  const templateRoot = fs.realpathSync(dir);
  const installedTargets = new Set<string>();
  let links = 0;
  for (const workspace of workspaceRoots) {
    const destination = path.join(
      workspace,
      "node_modules",
      "@effectstream",
      "runtime",
    );
    try {
      fs.lstatSync(destination);
    } catch {
      continue;
    }
    const installedTarget = fs.realpathSync(destination);
    const relativeTarget = path.relative(templateRoot, installedTarget);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      throw new Error(
        `Refusing to overlay runtime outside template: ${installedTarget}`,
      );
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(installedTarget, "package.json"), "utf8"),
    );
    if (manifest.name !== "@effectstream/runtime") {
      throw new Error(
        `Expected @effectstream/runtime at ${installedTarget}, found ${manifest.name}`,
      );
    }
    installedTargets.add(installedTarget);
    links++;
  }

  for (const installedTarget of installedTargets) {
    const installedSource = path.join(installedTarget, "src");
    fs.rmSync(installedSource, { recursive: true, force: true });
    fs.cpSync(runtimeSource, installedSource, { recursive: true });
  }

  return { links, targets: installedTargets.size };
}

async function runTemplate(name: string): Promise<Result> {
  const dir = path.join(__dirname, name);
  const start = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    console.log(`> bun install\n`);
    const install = Bun.spawn(["bun", "install"], {
      cwd: dir,
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env },
    });
    const installExit = await install.exited;
    if (installExit !== 0) {
      return {
        name,
        success: false,
        duration: Date.now() - start,
        error: `bun install failed (exit code ${installExit})`,
      };
    }

    if (LINK_LOCAL) {
      console.log(`\n> ./link.sh\n`);
      const link = Bun.spawn(["bash", "./link.sh"], {
        cwd: dir,
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env },
      });
      const linkExit = await link.exited;
      if (linkExit !== 0) {
        return {
          name,
          success: false,
          duration: Date.now() - start,
          error: `link.sh failed (exit code ${linkExit})`,
        };
      }
      const linked = fanOutEffectstreamLinks(dir);
      console.log(
        `\nLINK_LOCAL=1: redirected ${linked} workspace @effectstream dependency link(s) to monorepo sources\n`,
      );
    } else if (LINK_RUNTIME_ONLY) {
      const { links, targets } = overlayRuntimeSource(dir);
      console.log(
        `\nLINK_RUNTIME_ONLY=1: overlaid local runtime source onto ${targets} installed package target(s) referenced by ${links} existing workspace link(s)\n`,
      );
    }

    const proc = Bun.spawn(["bun", "run", "test"], {
      cwd: dir,
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env },
    });
    const exitCode = await proc.exited;
    const duration = Date.now() - start;

    if (exitCode !== 0) {
      return { name, success: false, duration, error: `exit code ${exitCode}` };
    }
    return { name, success: true, duration };
  } catch (e) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  // --skip-disabled: when explicit template args are given but none are ENABLED,
  // exit 0 (skip) instead of 1. Used by CI so that a push touching only a
  // disabled/unknown template passes instead of failing. Without the flag the
  // strict exit(1) is kept so manual runs still surface typos.
  const skipDisabled = process.argv.includes("--skip-disabled");
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const selected =
    args.length > 0 ? ENABLED.filter((name) => args.includes(name)) : ENABLED;

  if (selected.length === 0) {
    if (skipDisabled && args.length > 0) {
      console.log(
        `No enabled templates among [${args.join(", ")}] — skipping. Enabled: ${ENABLED.join(", ")}`,
      );
      exit(0);
    }
    console.error("No matching templates. Enabled:", ENABLED.join(", "));
    exit(1);
  }

  if (LINK_LOCAL && LINK_RUNTIME_ONLY) {
    console.error("LINK_LOCAL and LINK_RUNTIME_ONLY are mutually exclusive");
    exit(1);
  }

  if (LINK_LOCAL) {
    const missing = selected.filter(
      (name) => !fs.existsSync(path.join(__dirname, name, "link.sh")),
    );
    if (missing.length > 0) {
      console.error(
        `LINK_LOCAL is set but these template(s) have no link.sh: ${missing.join(", ")}`,
      );
      exit(1);
    }
  }

  if (LINK_LOCAL) {
    // Local package symlinks resolve their own dependency graph from the
    // monorepo root, so install that graph before processing templates.
    const root = path.join(__dirname, "..");
    console.log("LINK_LOCAL=1: running `bun install` at monorepo root\n");
    const rootInstall = Bun.spawn(["bun", "install"], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env },
    });
    if ((await rootInstall.exited) !== 0) {
      console.error("Monorepo root `bun install` failed");
      exit(1);
    }
    console.log("\nLINK_LOCAL=1: linking after each template install\n");
  }

  console.log(
    `Running tests for ${selected.length} template(s): ${selected.join(", ")}\n`,
  );

  const results: Result[] = [];
  for (const name of selected) {
    results.push(await runTemplate(name));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Template Test Summary");
  console.log(`${"=".repeat(60)}`);
  for (const r of results) {
    const status = r.success ? "[PASS]" : "[FAIL]";
    const mins = Math.floor(r.duration / 60000);
    const secs = ((r.duration % 60000) / 1000).toFixed(0);
    const duration = mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
    console.log(`  ${status} ${r.name} (${duration})`);
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log(`\n  ${failed.length}/${results.length} template(s) failed`);
    exit(1);
  } else {
    console.log(`\n  All ${results.length} template(s) passed`);
  }
}

if (import.meta.main) main();
