/**
 * Template test runner (`bun run test` at the template root).
 *
 *   0. prepare  — compile the Midnight contract if needed (pinned compactc
 *                 0.35.0; skipped when contract-bridge/src/managed is up to date).
 *   1. unit     — no chain, no ports:
 *                   solana-instructions.test.ts     layouts, log parser, FR-009 guards
 *                   lock-to-contract.test.ts        LockToContract / LOCKC (00058 I-2 vectors)
 *                   midnight-signing.test.ts        mint digest/signature, raw contract info (E8)
 *                   midnight-contract-logic.test.ts circuits run locally on runtime 0.20
 *                   state-machine.test.ts           STF over recorded P0 payloads (PGLite)
 *                   node-config-api.test.ts         sync config + API (Fastify inject, PGLite)
 *                   relayer-jobs.test.ts            relayer selection, backoff, job building
 *                   cli-args.test.ts                CLI argument validation
 *   2. program  — solana-program.test.ts: the bridge program on a throwaway local
 *                 validator (random ports >= 10000), or on SOLANA_RPC_URL if set.
 *   3. e2e      — the full local stack (packages/tests/start.test.ts = start.dev.ts
 *                 with `sync` non-critical) is started, then:
 *                   e2e.test.ts       US1, US2, the negatives, the relayer kill/restart
 *                                     and the wiped-database re-sync (US4), SC-001/003
 *                   contract.test.ts  on the same devnet, after `sync` is stopped (its
 *                                     dev wallet 0x…01 is also the relayer's)
 *                 and the stack is shut down. Per-process logs and the e2e report go
 *                 to logs/e2e-<timestamp>/.
 *                 It needs the rc.8 contract prover: MIDNIGHT_CONTRACT_PROOF_SERVER_URL
 *                 (e.g. a Docker sibling), or Docker (the stack starts the image).
 *                 BRIDGE_E2E=0 skips it, BRIDGE_E2E=1 requires it.
 *      contract — without the stack, contract.test.ts SKIPS (and says why) unless a
 *                 devnet with both provers is already running.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { startStack, waitForBoot, waitForNodeApi, type StartedStack } from "./helpers/stack.ts";

const here = import.meta.dirname!;
const templateRoot = path.resolve(here, "../..");
const contractsMidnight = path.resolve(here, "../contracts-midnight");

const UNIT = [
  "./solana-instructions.test.ts",
  "./lock-to-contract.test.ts",
  "./midnight-signing.test.ts",
  "./midnight-contract-logic.test.ts",
  "./state-machine.test.ts",
  "./node-config-api.test.ts",
  "./relayer-jobs.test.ts",
  "./cli-args.test.ts",
].filter((f) => fs.existsSync(path.join(here, f)));

const results: { name: string; ok: boolean; seconds: number; note?: string }[] = [];

async function bunTest(name: string, files: string[], timeoutMs: number, env: Record<string, string> = {}): Promise<boolean> {
  console.log(`\n=== ${name}: bun test ${files.join(" ")} ===\n`);
  const started = Date.now();
  const proc = Bun.spawn(["bun", "test", "--timeout", String(timeoutMs), ...files], {
    cwd: here,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...env },
  });
  const code = await proc.exited;
  results.push({ name, ok: code === 0, seconds: (Date.now() - started) / 1000 });
  return code === 0;
}

/** Whether the e2e phase can run here, and why. */
function e2eDecision(): { run: boolean; required: boolean; reason: string } {
  const flag = process.env.BRIDGE_E2E?.trim();
  if (flag === "0") return { run: false, required: false, reason: "BRIDGE_E2E=0" };
  if (process.env.MIDNIGHT_CONTRACT_PROOF_SERVER_URL?.trim()) {
    return { run: true, required: flag === "1", reason: `contract prover at ${process.env.MIDNIGHT_CONTRACT_PROOF_SERVER_URL}` };
  }
  const docker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
  if (docker) return { run: true, required: flag === "1", reason: "Docker is available (the stack starts proof server 9.0.0-rc.8)" };
  return {
    run: flag === "1",
    required: flag === "1",
    reason: "no contract prover: set MIDNIGHT_CONTRACT_PROOF_SERVER_URL or install Docker (proof server 9.0.0-rc.8)",
  };
}

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

await bunTest("unit", UNIT, 180_000);
await bunTest("program", ["./solana-program.test.ts"], 180_000);

const e2e = e2eDecision();
if (!e2e.run) {
  console.log(`\n=== e2e: SKIPPED (${e2e.reason}) ===\n`);
  results.push({ name: "e2e", ok: !e2e.required, seconds: 0, note: `skipped: ${e2e.reason}` });
  await bunTest("contract", ["./contract.test.ts"], 1_800_000);
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.join(templateRoot, "logs", `e2e-${stamp}`);
  console.log(`\n=== e2e: starting the local stack (${e2e.reason}); logs in ${path.relative(templateRoot, logDir)} ===\n`);
  let stack: StartedStack | null = null;
  const started = Date.now();
  try {
    stack = await startStack({ logDir });
    const bootMs = await waitForBoot(stack, "sync", Number(process.env.BRIDGE_E2E_BOOT_TIMEOUT_MS ?? 2_700_000));
    await waitForNodeApi(process.env.BRIDGE_API_URL ?? `http://localhost:${process.env.EFFECTSTREAM_API_PORT ?? "9999"}`, 900_000);
    results.push({ name: "stack boot", ok: true, seconds: (Date.now() - started) / 1000, note: `sync running after ${(bootMs / 1000).toFixed(0)} s` });
    await bunTest("e2e", ["./e2e.test.ts"], 5_400_000, { BRIDGE_E2E_LOG_DIR: logDir });
    // contract.test.ts pays with the dev wallet 0x…01, which is also the relayer's:
    // stop the node (and its relayer) first so the two never race for its DUST.
    await stack.orchestrator.stop("sync").catch((e) => console.error("[run-tests] stop sync:", e));
    await bunTest("contract (on the e2e devnet)", ["./contract.test.ts"], 1_800_000);
  } catch (e) {
    console.error("[run-tests] e2e stack:", e instanceof Error ? e.message : e);
    results.push({ name: "stack boot", ok: false, seconds: (Date.now() - started) / 1000, note: String(e instanceof Error ? e.message : e) });
  } finally {
    const t = Date.now();
    await stack?.stop();
    console.log(`[run-tests] stack stopped in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
}

console.log("\n=== summary ===");
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.seconds.toFixed(1)} s)${r.note ? ` — ${r.note}` : ""}`);
}
console.log(`  (cwd ${path.relative(process.cwd(), here) || "."})`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
