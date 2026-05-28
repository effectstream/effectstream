/**
 * Runs `bun run test` in each enabled template, serially (they share ports).
 * Prints a pass/fail summary at the end.
 *
 * Usage:
 *   bun run templates/run-template-tests.ts                      # all enabled
 *   bun run templates/run-template-tests.ts preorder shinkai-v2   # specific ones
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

const ENABLED = [
  "cardano-delegation",
  "evm-cardano",
  "evm-midnight-v2",
  "preorder",
  "projected-nft-preorder",
  "shinkai-v2",
  "zk-cardano",
  "zswap-da",
  "batcher-validations",
  // "chess-v2",        // re-enable once frontend test tolerates @mui "use client" warnings (see plan)
  // "chess",           // TODO: migrate to effectstream-bun
  // "dice",            // TODO: migrate to effectstream-bun
  // "evm-midnight",    // TODO: migrate to effectstream-bun
  // "minimal",         // TODO: migrate to effectstream-bun
  // "multi-chain-token-transfer", // TODO: migrate to effectstream-bun
  // "night-bitcoin",   // TODO: migrate to effectstream-bun
  // "rock-paper-scissors", // TODO: migrate to effectstream-bun
  "world-map-2d",
];

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

async function main() {
  const args = process.argv.slice(2);
  const selected = args.length > 0
    ? ENABLED.filter((name) => args.includes(name))
    : ENABLED;

  if (selected.length === 0) {
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

main();
