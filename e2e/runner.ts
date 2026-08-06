/**
 * Master runner for e2e test suites.
 * Executes all chain test suites serially because they share ports.
 *
 * Usage: bun run e2e/runner.ts
 */
import { exit } from "process";

const suites = [
  { name: "evm", script: "./evm/run-tests.ts" },
  { name: "bitcoin", script: "./bitcoin/run-tests.ts" },
  { name: "cardano", script: "./cardano/run-tests.ts" },
  { name: "midnight", script: "./midnight/run-tests.ts" },
  { name: "multi-batcher", script: "./multi-batcher/run-tests.ts" },
  { name: "avail", script: "./avail/run-tests.ts" },
  { name: "celestia", script: "./celestia/run-tests.ts" },
  { name: "near", script: "./near/run-tests.ts" },
  { name: "solana", script: "./solana/run-tests.ts" },
  { name: "features", script: "./features/run-tests.ts" },
  { name: "wallets", script: "./wallets-ui/run-tests.ts" },
  { name: "sync-repro", script: "./sync-repro/run-tests.ts" },
];

const __dirname = import.meta.dirname ?? ".";

interface SuiteResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

async function runSuite(suite: { name: string; script: string }): Promise<SuiteResult> {
  const start = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Running: ${suite.name}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    const scriptPath = `${__dirname}/${suite.script}`;
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      cwd: __dirname,
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env },
    });

    const exitCode = await proc.exited;
    const duration = Date.now() - start;

    if (exitCode !== 0) {
      return { name: suite.name, success: false, duration, error: `Exit code: ${exitCode}` };
    }
    return { name: suite.name, success: true, duration };
  } catch (e) {
    const duration = Date.now() - start;
    return {
      name: suite.name,
      success: false,
      duration,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  // Filter suites: CLI args to include, DISABLE_<NAME> env vars to exclude
  // Examples:
  //   bun run runner.ts celestia           # run only celestia
  //   DISABLE_EVM=1 DISABLE_AVAIL=1 bun run runner.ts  # run all except evm and avail
  const args = process.argv.slice(2);
  const selectedSuites = suites
    .filter((s) => args.length === 0 || args.includes(s.name))
    .filter((s) => !process.env[`DISABLE_${s.name.toUpperCase()}`]);

  if (selectedSuites.length === 0) {
    console.error("No matching suites found. Available:", suites.map((s) => s.name).join(", "));
    exit(1);
  }

  console.log(`Running ${selectedSuites.length} test suite(s): ${selectedSuites.map((s) => s.name).join(", ")}`);

  const maxRetries = parseInt(process.env["E2E_MAX_RETRIES"] || "1", 10);
  const results: SuiteResult[] = [];

  for (const suite of selectedSuites) {
    const result = await runSuite(suite);
    results.push(result);

    if (!result.success) {
      console.error(`\n  Suite "${suite.name}" FAILED: ${result.error}`);
    }
  }

  // Retry failed suites
  const failedSuites = results.filter((r) => !r.success);
  if (failedSuites.length > 0 && maxRetries > 0) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const toRetry = results.filter((r) => !r.success);
      if (toRetry.length === 0) break;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`  Retrying ${toRetry.length} failed suite(s) (attempt ${attempt}/${maxRetries})`);
      console.log(`${"=".repeat(60)}`);

      for (const failed of toRetry) {
        const suite = selectedSuites.find((s) => s.name === failed.name)!;
        const retryResult = await runSuite(suite);

        if (retryResult.success) {
          // Replace the failed result with the successful retry
          const idx = results.indexOf(failed);
          results[idx] = { ...retryResult, name: `${retryResult.name} (retry ${attempt})` };
        } else {
          console.error(`\n  Suite "${suite.name}" FAILED on retry ${attempt}: ${retryResult.error}`);
        }
      }
    }
  }

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("  E2E Test Suite Summary");
  console.log(`${"=".repeat(60)}`);
  for (const result of results) {
    const status = result.success ? "[PASS]" : "[FAIL]";
    const duration = `${(result.duration / 1000).toFixed(1)}s`;
    console.log(`  ${status} ${result.name} (${duration})`);
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log(`\n  ${failed.length}/${results.length} suite(s) failed`);
    exit(1);
  } else {
    console.log(`\n  All ${results.length} suite(s) passed`);
  }
}

main();
