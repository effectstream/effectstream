/**
 * Repro for sync/CLAUDE.md Finding #3 (unpaced fetch loop).
 *
 * `orchestration/sync.ts` guards all three of its `sleep`s with
 * `if ("pollingInterval" in config.syncProtocol)`. A protocol whose config
 * lacks that key therefore never sleeps — not on error, and not in the ordinary
 * "caught up" pass where `stateToInput` returns `undefined`.
 *
 * The Cardano/utxorpc schema is exactly that case: it is the only sync protocol
 * that does not merge `PollingSyncProtocol`, so `pollingInterval` is neither
 * declared, typed, nor defaulted (asserted below). Every config in this repo
 * happens to pass it anyway as an undeclared extra field — which is the only
 * reason Cardano sync works today. Build a config strictly from the schema and
 * the node freezes.
 *
 * "Freezes", not "spins": the probe below shows the loop starves the event
 * loop outright — a `setTimeout` scheduled for 500 ms had still not fired after
 * 4 s of looping. Nothing else in the process runs: not the HTTP server, not
 * the other chains' fetch loops, and not the gRPC stream callbacks that would
 * advance utxorpc's own tip and let the loop make progress.
 *
 * When the fix lands (declare `pollingInterval` on the utxorpc schema and/or
 * make the sleep unconditional in `startSync`), the KNOWN-BROKEN test should
 * report `reason: "window"` like its paced counterpart.
 */
import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  ConfigSyncProtocolSchemaCardanoUtxoRpcParallel,
  ConfigSyncProtocolSchemaEvmParallel,
} from "@effectstream/config";

const PROBE = join(import.meta.dir, "spin-probe.ts");

/** Every property a protocol config may carry, required + optional. */
function schemaKeys(schema: unknown): string[] {
  const config = (schema as { config: { required: any; optional: any } }).config;
  return [
    ...Object.keys(config.required.properties ?? {}),
    ...Object.keys(config.optional.properties ?? {}),
  ];
}

type ProbeResult = {
  reason: "limit" | "window";
  iterations: number;
  elapsedMs: number;
};

async function runProbe(spec: {
  polling: number | null;
  limit: number;
  windowMs: number;
  mode: "sync" | "call";
}): Promise<ProbeResult> {
  const proc = Bun.spawn(["bun", PROBE, JSON.stringify(spec)], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  if (!line) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`probe produced no result\n${stderr}`);
  }
  return JSON.parse(line) as ProbeResult;
}

test("root cause: the utxorpc schema does not declare pollingInterval", () => {
  const utxorpc = schemaKeys(ConfigSyncProtocolSchemaCardanoUtxoRpcParallel);
  const evm = schemaKeys(ConfigSyncProtocolSchemaEvmParallel);

  // The runtime fetch loop keys off this exact property name.
  expect(utxorpc).not.toContain("pollingInterval");
  // Every other polling protocol declares it — utxorpc is the outlier.
  expect(evm).toContain("pollingInterval");
});

test("CONTROL: with a pollingInterval the fetch loop is paced", async () => {
  const result = await runProbe({
    polling: 20,
    limit: 200_000,
    windowMs: 500,
    mode: "call",
  });

  // The window timer fired, so the event loop stayed responsive.
  expect(result.reason).toBe("window");
  // ~500ms / 20ms ≈ 25 passes. Generous bound; the point is it's tens, not tens
  // of thousands.
  expect(result.iterations).toBeLessThan(200);
}, 30_000);

test("KNOWN-BROKEN: without a pollingInterval the fetch loop starves the event loop", async () => {
  const WINDOW_MS = 500;
  const result = await runProbe({
    polling: null,
    limit: 200_000,
    // Same window as the control. If the loop were merely "fast" this timer
    // would still fire; it does not.
    windowMs: WINDOW_MS,
    mode: "call",
  });

  // The loop burned through the iteration cap instead of ever yielding to the
  // timer — the discriminator between "spins hot" and "starves everything".
  expect(result.reason).toBe("limit");
  expect(result.iterations).toBe(200_000);
  // The 500ms timer never ran despite the process being busy for far longer.
  expect(result.elapsedMs).toBeGreaterThan(WINDOW_MS);
}, 30_000);
