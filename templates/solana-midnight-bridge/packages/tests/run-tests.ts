/**
 * Template test runner (`bun run test` at the template root).
 *
 *   0. prepare  — compile the Midnight contract if needed (pinned compactc
 *                 0.35.0; skipped when contract-bridge/src/managed is up to date).
 *   1. unit     — no chain, no ports:
 *                   solana-instructions.test.ts     layouts, log parser, FR-009 guards
 *                   midnight-signing.test.ts        mint digest/signature, raw contract info (E8)
 *                   midnight-contract-logic.test.ts circuits run locally on runtime 0.20
 *                   state-machine.test.ts           STF over recorded P0 payloads (PGLite)
 *                   node-config-api.test.ts         sync config + API (Fastify inject, PGLite)
 *                   relayer-jobs.test.ts            relayer selection, backoff, job building
 *                   cli-args.test.ts                CLI argument validation
 *   2. program  — solana-program.test.ts: the bridge program on a throwaway local
 *                 validator (random ports >= 10000), or on SOLANA_RPC_URL if set.
 *   3. contract — contract.test.ts on a local Midnight devnet with both provers;
 *                 it SKIPS (and says why) when none is reachable.
 *
 * TODO(PR-2 T6) the orchestrated phases through start.test.ts: US1, US2, US4
 *   and the negatives (sub-plan plans/00050-solana-midnight-bridge-pr2-template.md).
 */
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname!;
const contractsMidnight = path.resolve(here, "../contracts-midnight");

const UNIT = [
  "./solana-instructions.test.ts",
  "./midnight-signing.test.ts",
  "./midnight-contract-logic.test.ts",
  "./state-machine.test.ts",
  "./node-config-api.test.ts",
  "./relayer-jobs.test.ts",
  "./cli-args.test.ts",
].filter((f) => fs.existsSync(path.join(here, f)));

const suites: { name: string; files: string[]; timeoutMs: number }[] = [
  { name: "unit", files: UNIT, timeoutMs: 180_000 },
  { name: "program", files: ["./solana-program.test.ts"], timeoutMs: 180_000 },
  { name: "contract", files: ["./contract.test.ts"], timeoutMs: 1_800_000 },
];

const results: { name: string; ok: boolean; seconds: number }[] = [];

console.log("\n=== prepare: compile the Midnight contract (skipped when up to date) ===\n");
{
  const started = Date.now();
  const proc = Bun.spawn(["bash", "scripts/compile.sh"], {
    cwd: contractsMidnight,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  results.push({ name: "prepare", ok: code === 0, seconds: (Date.now() - started) / 1000 });
  if (code !== 0) {
    console.error("compile failed; the Midnight suites cannot run");
    process.exit(1);
  }
}

for (const suite of suites) {
  console.log(`\n=== ${suite.name}: bun test ${suite.files.join(" ")} ===\n`);
  const started = Date.now();
  const proc = Bun.spawn(["bun", "test", "--timeout", String(suite.timeoutMs), ...suite.files], {
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
