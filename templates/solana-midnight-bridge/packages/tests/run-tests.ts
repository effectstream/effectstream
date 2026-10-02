/**
 * Template test runner (`bun run test` at the template root).
 *
 * Wired now (PR-2 T1):
 *   1. unit    — solana-instructions.test.ts: layouts, log parser, FR-009 guards (no chain).
 *   2. program — solana-program.test.ts: the bridge program on a throwaway local
 *                validator (random ports >= 10000), or on SOLANA_RPC_URL if set.
 *
 * TODO(PR-2 T2 tests) contract.test.ts on the local Midnight devnet.
 * TODO(PR-2 T3/T4/T5 tests) state machine, relayer selection/backoff, CLI args.
 * TODO(PR-2 T6) the orchestrated phases through start.test.ts: US1, US2, US4
 *   and the negatives (sub-plan plans/00050-solana-midnight-bridge-pr2-template.md).
 */
import path from "node:path";

const here = import.meta.dirname!;

const suites: { name: string; file: string }[] = [
  { name: "unit", file: "./solana-instructions.test.ts" },
  { name: "program", file: "./solana-program.test.ts" },
];

const results: { name: string; ok: boolean; seconds: number }[] = [];
for (const suite of suites) {
  console.log(`\n=== ${suite.name}: bun test ${suite.file} ===\n`);
  const started = Date.now();
  const proc = Bun.spawn(["bun", "test", "--timeout", "180000", suite.file], {
    cwd: here,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  const code = await proc.exited;
  results.push({ name: suite.name, ok: code === 0, seconds: (Date.now() - started) / 1000 });
}

console.log("\n=== summary ===");
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.seconds.toFixed(1)} s)`);
console.log(`  (cwd ${path.relative(process.cwd(), here) || "."})`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
