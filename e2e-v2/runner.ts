/**
 * Master runner for e2e-v2 test suites.
 * Executes all chain test suites serially because they share ports.
 *
 * Usage: bun run e2e-v2/runner.ts
 */
import { exit } from "process";

const suites = [
  { name: "evm", script: "./evm/run-tests.ts" },
  { name: "bitcoin", script: "./bitcoin/run-tests.ts" },
  // { name: "cardano", script: "./cardano/run-tests.ts" },  // TODO: needs transaction submission step
  { name: "midnight", script: "./midnight/run-tests.ts" },
  { name: "avail", script: "./avail/run-tests.ts" },
  // { name: "celestia", script: "./celestia/run-tests.ts" },  // NYI: needs external light node
  { name: "features", script: "./features/run-tests.ts" },
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
  // Filter suites by CLI args if provided
  const args = process.argv.slice(2);
  const selectedSuites = args.length > 0
    ? suites.filter((s) => args.includes(s.name))
    : suites;

  if (selectedSuites.length === 0) {
    console.error("No matching suites found. Available:", suites.map((s) => s.name).join(", "));
    exit(1);
  }

  console.log(`Running ${selectedSuites.length} test suite(s): ${selectedSuites.map((s) => s.name).join(", ")}`);

  const results: SuiteResult[] = [];

  for (const suite of selectedSuites) {
    const result = await runSuite(suite);
    results.push(result);

    if (!result.success) {
      console.error(`\n  Suite "${suite.name}" FAILED: ${result.error}`);
    }
  }

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("  E2E-V2 Test Suite Summary");
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
