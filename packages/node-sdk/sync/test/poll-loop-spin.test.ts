/**
 * Regression guard for sync/CLAUDE.md Finding #3 (unpaced fetch loop).
 *
 * `orchestration/sync.ts` used to guard all three of its `sleep`s with
 * `if ("pollingInterval" in config.syncProtocol)`, so a protocol whose config
 * lacked that key never slept — not on error, and not in the ordinary "caught
 * up" pass where `stateToInput` returns `undefined`.
 *
 * The Cardano/utxorpc schema was exactly that case: the only sync protocol that
 * did not merge `PollingSyncProtocol`. Every config in this repo happened to
 * pass `pollingInterval` anyway as an undeclared extra field, which is the only
 * reason Cardano sync worked at all; a config built strictly from the schema
 * produced a node that froze.
 *
 * "Froze", not "span": the probe showed the loop starving the event loop
 * outright — a `setTimeout` scheduled for 500ms had still not fired after 4s of
 * looping. Nothing else in the process runs in that state: not the HTTP server,
 * not the other chains' fetch loops, and not the stream callbacks that would
 * advance utxorpc's own tip and let the loop escape.
 *
 * Fixed on both sides: the utxorpc schema now merges `PollingSyncProtocol`, and
 * `startSync` sleeps unconditionally with a fallback interval so no protocol
 * can hot-loop regardless of what its schema declares. Both halves are asserted
 * below — the second is what makes the first non-load-bearing.
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

test("every polling protocol declares pollingInterval, utxorpc included", () => {
  const utxorpc = schemaKeys(ConfigSyncProtocolSchemaCardanoUtxoRpcParallel);
  const evm = schemaKeys(ConfigSyncProtocolSchemaEvmParallel);

  // The runtime fetch loop keys its sleeps off this exact property name.
  expect(utxorpc).toContain("pollingInterval");
  expect(evm).toContain("pollingInterval");
  // Merged in from PollingSyncProtocol along with it.
  expect(utxorpc).toContain("requestTimeoutMs");
});

test("with a pollingInterval the fetch loop is paced", async () => {
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

test("without a pollingInterval the fetch loop still paces itself", async () => {
  const WINDOW_MS = 1_500;
  const result = await runProbe({
    polling: null,
    limit: 200_000,
    // Comfortably longer than one FALLBACK_POLLING_INTERVAL_MS (1s) so the
    // paced loop gets at least one pass in before the window closes.
    windowMs: WINDOW_MS,
    mode: "call",
  });

  // Before the fix this reported `reason: "limit"` with 200k iterations and a
  // 500ms timer that never fired at all.
  expect(result.reason).toBe("window");
  // One pass per fallback interval — single digits over this window.
  expect(result.iterations).toBeLessThan(10);
}, 30_000);
