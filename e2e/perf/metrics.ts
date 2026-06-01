/**
 * Perf metrics sampler + reporter.
 *
 * Polls the node's /debug/metrics endpoint on an interval and records a time
 * series of memory, per-protocol buffered backlog (`buf`), and the derived sync
 * lag (lag_seconds = mainNtp.buf × blockTimeMS/1000). It also times a few API
 * endpoints each tick so we can report p50/p95 latency under load.
 */

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const BASE = `http://localhost:${API_PORT}`;
const MAIN_PROTOCOL = "mainNtp";

export type ProtoMetric = {
  name: string;
  buf: number;
  ownBlockNumber: number | null;
};

export type MetricsResponse = {
  timestamp: number;
  uptimeSeconds: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers?: number;
  };
  protocols: ProtoMetric[];
  // Apply-stage lag (added to /debug/metrics). `buf` is fetch backlog; this is
  // how far behind the apply/finalize stage is — the signal that matters under
  // write-bound load, where `buf` stays ~0 while real lag grows.
  applied?: {
    blockNumber: number | null;
    timestamp: number | null;
    lagSeconds: number | null;
  };
};

/** Shape of one row from GET /block-heights. */
export type BlockHeight = {
  protocol_name: string;
  synced_page: number | null;
  fetched_page: number | null;
};

export type Sample = {
  t: number; // ms since sampler start
  wall: number; // Date.now()
  rss: number; // bytes
  heapUsed: number;
  mainBuf: number;
  mainOwnBlock: number | null;
  evmBuf: number;
  evmOwnBlock: number | null;
  lagSeconds: number; // buf-derived (fetch) lag: mainBuf × blockTimeMS/1000
  appliedBlock: number | null; // last applied effectstream block number
  appliedLagSeconds: number | null; // now − applied block timestamp (true apply lag)
  applyBacklog: number | null; // mainNtp fetched_page − synced_page (DB-backed)
  entries: number | null; // cumulative processed entries (if a countProvider is given)
  apiMs: Record<string, number | null>; // per-endpoint latency for this tick
};

export const ENDPOINTS = ["/health", "/block-heights", "/debug/metrics"] as const;

async function timedFetch(
  url: string,
): Promise<{ ms: number; ok: boolean; json: any }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url);
    const ms = performance.now() - t0;
    let json: any = null;
    try {
      json = await res.json();
    } catch { /* non-JSON */ }
    return { ms, ok: res.ok, json };
  } catch {
    return { ms: performance.now() - t0, ok: false, json: null };
  }
}

export async function getMetricsOnce(): Promise<MetricsResponse | null> {
  const { json, ok } = await timedFetch(`${BASE}/debug/metrics`);
  return ok ? (json as MetricsResponse) : null;
}

export function lagSecondsFromBuf(buf: number, blockTimeMS: number): number {
  return buf * (blockTimeMS / 1000);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const MB = 1024 * 1024;

export class Sampler {
  readonly samples: Sample[] = [];
  readonly latencies: Record<string, number[]> = {};
  private timer: ReturnType<typeof setInterval> | undefined;
  private startMs = 0;
  private ticking = false;

  constructor(
    private readonly blockTimeMS: number,
    private readonly intervalMs = 1000,
    // Optional: queried once per tick to record cumulative entries over time.
    private readonly countProvider?: () => Promise<number>,
  ) {
    for (const e of ENDPOINTS) this.latencies[e] = [];
  }

  private async tick(): Promise<void> {
    const wall = Date.now();
    // Probe each endpoint for latency; reuse /debug/metrics result for data.
    let metricsJson: MetricsResponse | null = null;
    let blockHeights: BlockHeight[] | null = null;
    const apiMs: Record<string, number | null> = {};
    for (const e of ENDPOINTS) {
      const { ms, ok, json } = await timedFetch(`${BASE}${e}`);
      apiMs[e] = ok ? ms : null;
      if (ok) this.latencies[e].push(ms);
      if (e === "/debug/metrics" && ok) metricsJson = json as MetricsResponse;
      if (e === "/block-heights" && ok) blockHeights = json as BlockHeight[];
    }
    if (!metricsJson) return;

    let entries: number | null = null;
    if (this.countProvider) {
      try {
        entries = await this.countProvider();
      } catch {
        entries = null;
      }
    }

    const main = metricsJson.protocols.find((p) => p.name === MAIN_PROTOCOL);
    const evm = metricsJson.protocols.find((p) =>
      p.name.startsWith("parallelEvmRPC")
    );
    const mainBuf = main?.buf ?? 0;
    const mainHeight = blockHeights?.find((b) => b.protocol_name === MAIN_PROTOCOL);
    const applyBacklog =
      mainHeight?.fetched_page != null && mainHeight?.synced_page != null
        ? mainHeight.fetched_page - mainHeight.synced_page
        : null;
    this.samples.push({
      t: wall - this.startMs,
      wall,
      rss: metricsJson.memory.rss,
      heapUsed: metricsJson.memory.heapUsed,
      mainBuf,
      mainOwnBlock: main?.ownBlockNumber ?? null,
      evmBuf: evm?.buf ?? 0,
      evmOwnBlock: evm?.ownBlockNumber ?? null,
      lagSeconds: lagSecondsFromBuf(mainBuf, this.blockTimeMS),
      appliedBlock: metricsJson.applied?.blockNumber ?? null,
      appliedLagSeconds: metricsJson.applied?.lagSeconds ?? null,
      applyBacklog,
      entries,
      apiMs,
    });
  }

  start(): void {
    this.startMs = Date.now();
    // Skip a tick if the previous one is still in flight (slow DB/API under
    // load) so probes don't pile up on the shared connection.
    this.timer = setInterval(() => {
      if (this.ticking) return;
      this.ticking = true;
      void this.tick().finally(() => {
        this.ticking = false;
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  summary() {
    const rssMB = this.samples.map((s) => s.rss / MB);
    const lags = this.samples.map((s) => s.lagSeconds);
    const bufs = this.samples.map((s) => s.mainBuf);
    const appliedLags = this.samples
      .map((s) => s.appliedLagSeconds)
      .filter((v): v is number => v != null);
    const backlogs = this.samples
      .map((s) => s.applyBacklog)
      .filter((v): v is number => v != null);
    const latencySummary: Record<string, { p50: number; p95: number; max: number; n: number }> = {};
    for (const e of ENDPOINTS) {
      const arr = this.latencies[e];
      latencySummary[e] = {
        p50: Math.round(percentile(arr, 50) * 100) / 100,
        p95: Math.round(percentile(arr, 95) * 100) / 100,
        max: Math.round(Math.max(0, ...arr) * 100) / 100,
        n: arr.length,
      };
    }

    const entriesDiffs: number[] = [];
    const blocksDiffs: number[] = [];
    for (let i = 1; i < this.samples.length; i++) {
      const prev = this.samples[i - 1];
      const curr = this.samples[i];
      const dt = (curr.t - prev.t) / 1000;
      if (dt > 0) {
        if (curr.entries != null && prev.entries != null) {
          entriesDiffs.push((curr.entries - prev.entries) / dt);
        }
        if (curr.evmOwnBlock != null && prev.evmOwnBlock != null) {
          blocksDiffs.push((curr.evmOwnBlock - prev.evmOwnBlock) / dt);
        }
      }
    }
    const peakEntriesPerSec = entriesDiffs.length ? Math.max(...entriesDiffs) : 0;
    const peakBlocksPerSec = blocksDiffs.length ? Math.max(...blocksDiffs) : 0;

    return {
      samples: this.samples.length,
      peakRssMB: Math.round(Math.max(0, ...rssMB)),
      finalRssMB: Math.round(rssMB[rssMB.length - 1] ?? 0),
      peakLagSeconds: Math.round(Math.max(0, ...lags) * 10) / 10,
      peakMainBuf: Math.max(0, ...bufs),
      peakAppliedLagSeconds: appliedLags.length
        ? Math.round(Math.max(...appliedLags) * 10) / 10
        : 0,
      peakApplyBacklog: backlogs.length ? Math.max(...backlogs) : 0,
      peakEntriesPerSec: Math.round(peakEntriesPerSec),
      peakBlocksPerSec: Math.round(peakBlocksPerSec * 10) / 10,
      apiLatencyMs: latencySummary,
    };
  }
}

export type PhaseResult = {
  name: string;
  durationMs: number;
  entriesProcessed: number;
  entriesPerSec: number;
  blocksPerSec?: number;
  sampler: ReturnType<Sampler["summary"]>;
  samples: Sample[];
};

export function printReport(
  totalExpected: number,
  phases: PhaseResult[],
): void {
  console.log("\n========== PERF REPORT ==========");
  console.log(`Expected entries: ${totalExpected.toLocaleString()}`);
  for (const ph of phases) {
    console.log(`\n--- Phase: ${ph.name} ---`);
    console.log(`  duration:        ${(ph.durationMs / 1000).toFixed(1)}s`);
    console.log(`  entries:         ${ph.entriesProcessed.toLocaleString()}`);
    console.log(`  entries/sec:     ${ph.entriesPerSec.toFixed(0)} (peak: ${ph.sampler.peakEntriesPerSec.toLocaleString()}/s)`);
    if (ph.blocksPerSec != null) {
      console.log(`  blocks/sec:      ${ph.blocksPerSec.toFixed(1)} (peak: ${ph.sampler.peakBlocksPerSec.toFixed(1)}/s)`);
    } else {
      console.log(`  peak blocks/sec: ${ph.sampler.peakBlocksPerSec.toFixed(1)}/s`);
    }
    console.log(`  peak lag:        ${ph.sampler.peakLagSeconds}s (peak buf ${ph.sampler.peakMainBuf})  [fetch-side]`);
    console.log(`  peak APPLY lag:  ${ph.sampler.peakAppliedLagSeconds}s (peak backlog ${ph.sampler.peakApplyBacklog} blocks)  [apply-side, the real one]`);
    console.log(`  peak RSS:        ${ph.sampler.peakRssMB} MB (final ${ph.sampler.finalRssMB} MB)`);
    console.log(`  samples:         ${ph.sampler.samples}`);
    console.log(`  API latency (ms):`);
    for (const [ep, l] of Object.entries(ph.sampler.apiLatencyMs)) {
      console.log(`    ${ep.padEnd(20)} p50=${l.p50} p95=${l.p95} max=${l.max} (n=${l.n})`);
    }
  }
  console.log("\n=================================\n");
}
