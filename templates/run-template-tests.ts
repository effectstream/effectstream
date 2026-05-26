/**
 * Runs `bun run test` in each enabled template, serially (they share ports).
 * Prints a pass/fail summary at the end.
 *
 * Usage:
 *   bun run templates/run-template-tests.ts                      # all enabled
 *   bun run templates/run-template-tests.ts preorder shinkai-v2   # specific ones
 */
import { exit } from "process";
import path from "path";

const __dirname = import.meta.dirname!;

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
  // "chess-v2",        // TODO: migrate to effectstream-bun
  // "chess",           // TODO: migrate to effectstream-bun
  // "dice",            // TODO: migrate to effectstream-bun
  // "evm-midnight",    // TODO: migrate to effectstream-bun
  // "minimal",         // TODO: migrate to effectstream-bun
  // "multi-chain-token-transfer", // TODO: migrate to effectstream-bun
  // "rock-paper-scissors", // TODO: migrate to effectstream-bun
  // "world-map-2d",    // TODO: migrate to effectstream-bun
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
