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
 *   --skip-docker-managed  Leave Docker-managed templates to their dedicated
 *                    Compose CI job. Direct/manual runs require the unique
 *                    Compose project and diagnostic-port environment below.
 *
 * Env:
 *   LINK_LOCAL=1   After `bun install`, run each template's ./link.sh so the
 *                  tests resolve @effectstream/* to the local monorepo build
 *                  instead of the published packages. Every selected template
 *                  MUST have a link.sh or the run aborts before any tests run.
 *                  Also runs `bun install` at the monorepo root up front, since
 *                  the linked orchestrator resolves some deps from the root
 *                  workspace's node_modules.
 */
import { exit } from "process";
import fs from "fs";
import path from "path";

const __dirname = import.meta.dirname!;

const LINK_LOCAL = ["1", "true", "yes"].includes(
  (process.env.LINK_LOCAL ?? "").toLowerCase(),
);

export const ENABLED = [
  "cardano-delegation",
  "evm-cardano",
  "evm-midnight-v2",
  "midnight-stagenet-v2",
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

export const DOCKER_MANAGED = new Set(["midnight-stagenet-v2"]);

interface Result {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

async function runTemplate(name: string): Promise<Result> {
  const dir = path.join(__dirname, name);
  const start = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DOCKER_MANAGED.has(name)) return runDockerManagedTemplate(name, start);

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

async function runDockerManagedTemplate(name: string, start: number): Promise<Result> {
  const projectName = process.env.COMPOSE_PROJECT_NAME;
  const diagnosticPort = process.env.MIDNIGHT_V2_DIAGNOSTIC_PORT;
  if (!projectName || !diagnosticPort) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: "Docker-managed template requires preflighted COMPOSE_PROJECT_NAME and MIDNIGHT_V2_DIAGNOSTIC_PORT",
    };
  }
  const composeFile = path.join(__dirname, name, "compose.yaml");
  const seedSource = process.env.MIDNIGHT_V2_WALLET_SEED_SOURCE_FILE ??
    path.join(__dirname, name, "packages/tests/fixtures/undeployed-genesis-seed.txt");
  const env = {
    ...process.env,
    COMPOSE_PROJECT_NAME: projectName,
    MIDNIGHT_V2_DIAGNOSTIC_PORT: diagnosticPort,
    MIDNIGHT_V2_WALLET_SEED_SOURCE_FILE: seedSource,
  };
  try {
    const up = Bun.spawn([
      "docker", "compose", "-f", composeFile, "--profile", "hermetic", "up", "--build",
      "--abort-on-container-exit", "--exit-code-from", "tests",
    ], { stdout: "inherit", stderr: "inherit", env });
    const exitCode = await up.exited;
    return exitCode === 0
      ? { name, success: true, duration: Date.now() - start }
      : { name, success: false, duration: Date.now() - start, error: `Compose exited ${exitCode}` };
  } catch (error) {
    return {
      name,
      success: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    const down = Bun.spawn([
      "docker", "compose", "-f", composeFile, "--profile", "hermetic", "down",
      "--volumes", "--remove-orphans",
    ], { stdout: "inherit", stderr: "inherit", env });
    await down.exited;
  }
}

async function main() {
  // --skip-disabled: when explicit template args are given but none are ENABLED,
  // exit 0 (skip) instead of 1. Used by CI so that a push touching only a
  // disabled/unknown template passes instead of failing. Without the flag the
  // strict exit(1) is kept so manual runs still surface typos.
  const skipDisabled = process.argv.includes("--skip-disabled");
  const skipDockerManaged = process.argv.includes("--skip-docker-managed");
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const enabledSelection = args.length > 0
    ? ENABLED.filter((name) => args.includes(name))
    : ENABLED;
  const selected = skipDockerManaged
    ? enabledSelection.filter((name) => !DOCKER_MANAGED.has(name))
    : enabledSelection;

  if (selected.length === 0) {
    if ((skipDisabled || skipDockerManaged) && args.length > 0) {
      console.log(
        `No runnable templates among [${args.join(", ")}] — skipping. Enabled: ${ENABLED.join(", ")}`,
      );
      exit(0);
    }
    console.error("No matching templates. Enabled:", ENABLED.join(", "));
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

    // link.sh symlinks @effectstream/* to monorepo source. The linked
    // orchestrator resolves some deps (e.g. @effectstream/db/start-pglite) via
    // import.meta.resolve, which walks the monorepo's own node_modules — so the
    // root workspace must be installed first or that resolution fails.
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
    console.log("\nLINK_LOCAL=1: linking local monorepo packages after install\n");
  }

  console.log(`Running tests for ${selected.length} template(s): ${selected.join(", ")}\n`);

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
