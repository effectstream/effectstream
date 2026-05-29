/**
 * Perf report writer.
 *
 * Turns the per-phase time series captured by the Sampler into:
 *   - a self-contained HTML report with line charts (degradation over time)
 *   - the raw JSON (offline / run-to-run comparison)
 *
 * Charts are drawn with Chart.js loaded from a CDN, so viewing the HTML needs
 * internet. The JSON is always usable offline. Output lands in e2e/perf/results/.
 */
import fs from "fs";
import path from "path";
import { ENDPOINTS, type PhaseResult, type Sample } from "./metrics.ts";

const MB = 1024 * 1024;

type PhasePayload = {
  name: string;
  durationMs: number;
  entriesProcessed: number;
  entriesPerSec: number;
  blocksPerSec: number | null;
  summary: PhaseResult["sampler"];
  series: {
    t: number[];
    lagSeconds: number[];
    appliedLag: (number | null)[];
    applyBacklog: (number | null)[];
    rssMB: number[];
    heapMB: number[];
    mainBuf: number[];
    evmBuf: number[];
    mainOwnBlock: (number | null)[];
    evmOwnBlock: (number | null)[];
    appliedBlock: (number | null)[];
    entries: (number | null)[];
    api: Record<string, (number | null)[]>;
  };
};

function buildPayload(totalExpected: number, phases: PhaseResult[]) {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    totalExpected,
    generatedAt: new Date().toISOString(),
    phases: phases.map((ph): PhasePayload => {
      const ss = ph.samples;
      return {
        name: ph.name,
        durationMs: ph.durationMs,
        entriesProcessed: ph.entriesProcessed,
        entriesPerSec: ph.entriesPerSec,
        blocksPerSec: ph.blocksPerSec ?? null,
        summary: ph.sampler,
        series: {
          t: ss.map((s: Sample) => round1(s.t / 1000)),
          lagSeconds: ss.map((s) => s.lagSeconds),
          appliedLag: ss.map((s) => s.appliedLagSeconds),
          applyBacklog: ss.map((s) => s.applyBacklog),
          rssMB: ss.map((s) => Math.round(s.rss / MB)),
          heapMB: ss.map((s) => Math.round(s.heapUsed / MB)),
          mainBuf: ss.map((s) => s.mainBuf),
          evmBuf: ss.map((s) => s.evmBuf),
          mainOwnBlock: ss.map((s) => s.mainOwnBlock),
          evmOwnBlock: ss.map((s) => s.evmOwnBlock),
          appliedBlock: ss.map((s) => s.appliedBlock),
          entries: ss.map((s) => s.entries),
          api: Object.fromEntries(
            ENDPOINTS.map((e) => [e, ss.map((s) => s.apiMs[e] ?? null)]),
          ),
        },
      };
    }),
  };
}

// Browser-side render script. Plain ES5-ish string concatenation only — no
// backticks or ${...}, so it can be inlined into the HTML template literal.
const BROWSER_JS = `
const C = ['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2'];
function mkChart(id, title, labels, datasets, log){
  new Chart(document.getElementById(id), {
    type:'line',
    data:{ labels: labels, datasets: datasets.map(function(d,i){ return {
      label:d.label, data:d.data, borderColor:C[i%C.length], backgroundColor:C[i%C.length],
      borderWidth:1.5, pointRadius:0, tension:0.15, spanGaps:true }; }) },
    options:{ responsive:true, animation:false, interaction:{mode:'index',intersect:false},
      plugins:{ title:{display:true,text:title}, legend:{display:datasets.length>1} },
      scales:{ x:{ title:{display:true,text:'seconds since phase start'}, ticks:{maxTicksLimit:12} },
        y: log ? {type:'logarithmic'} : {beginAtZero:true} } }
  });
}
document.getElementById('meta').textContent =
  'Expected entries (Phase A target): ' + DATA.totalExpected.toLocaleString() + '  -  generated ' + DATA.generatedAt;
const root = document.getElementById('root');
DATA.phases.forEach(function(ph, pi){
  const sec = document.createElement('section');
  const sm = ph.summary;
  let h = '<h2>' + ph.name + '</h2><table class="sum">';
  h += '<tr><td>duration</td><td>' + (ph.durationMs/1000).toFixed(1) + 's</td>'
     + '<td>entries</td><td>' + ph.entriesProcessed.toLocaleString() + '</td>'
     + '<td>entries/sec</td><td>' + ph.entriesPerSec.toFixed(0) + '</td></tr>';
  h += '<tr><td>peak lag</td><td>' + sm.peakLagSeconds + 's (buf ' + sm.peakMainBuf + ')</td>'
     + '<td>peak RSS</td><td>' + sm.peakRssMB + ' MB</td>'
     + '<td>final RSS</td><td>' + sm.finalRssMB + ' MB</td></tr>';
  sec.innerHTML = h;
  const s = ph.series;
  const charts = [
    {id:'lag'+pi, title:'Sync lag (s): apply (real) vs fetch (buf)', ds:[{label:'apply lag', data:s.appliedLag},{label:'fetch lag (buf)', data:s.lagSeconds}]},
    {id:'buf'+pi, title:'Backlog: apply (blocks) vs fetch (buffered pages)', ds:[{label:'apply backlog', data:s.applyBacklog},{label:'mainNtp buf', data:s.mainBuf},{label:'evm buf', data:s.evmBuf}]},
    {id:'mem'+pi, title:'Memory (MB)', ds:[{label:'rss', data:s.rssMB},{label:'heapUsed', data:s.heapMB}]},
    {id:'blk'+pi, title:'Block progress: fetch tip vs applied', ds:[{label:'mainNtp tip', data:s.mainOwnBlock},{label:'applied', data:s.appliedBlock},{label:'evm tip', data:s.evmOwnBlock}]}
  ];
  if (s.entries.some(function(v){ return v != null; }))
    charts.push({id:'ent'+pi, title:'Entries processed (cumulative)', ds:[{label:'entries', data:s.entries}]});
  charts.push({id:'api'+pi, title:'API latency (ms, log scale)', log:true,
    ds:Object.keys(s.api).map(function(k){ return {label:k, data:s.api[k]}; })});
  const grid = document.createElement('div'); grid.className = 'grid';
  charts.forEach(function(c){
    const card = document.createElement('div'); card.className = 'card';
    const cv = document.createElement('canvas'); cv.id = c.id;
    card.appendChild(cv); grid.appendChild(card);
  });
  sec.appendChild(grid); root.appendChild(sec);
  if (!s.t.length){
    const p = document.createElement('p'); p.textContent = '(no samples captured for this phase)';
    sec.appendChild(p); return;
  }
  charts.forEach(function(c){ mkChart(c.id, c.title, s.t, c.ds, !!c.log); });
});
`;

function renderHtml(payload: ReturnType<typeof buildPayload>): string {
  // Escape "<" so a stray sequence in the data can't close the script tag.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Effectstream perf report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:24px;color:#111;background:#fafafa}
  h1{margin:0 0 4px;font-size:22px}
  #meta{color:#666;font-size:13px;margin-bottom:16px}
  section{margin:24px 0;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px}
  h2{margin:0 0 8px;font-size:18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px;margin-top:12px}
  .card{border:1px solid #eee;border-radius:6px;padding:8px}
  table.sum{border-collapse:collapse;font-size:13px;margin-top:4px}
  table.sum td{padding:2px 12px 2px 0}
  table.sum td:nth-child(odd){color:#666}
</style>
</head>
<body>
<h1>Effectstream perf report</h1>
<div id="meta"></div>
<div id="root"></div>
<script>
const DATA = ${json};
${BROWSER_JS}
</script>
</body>
</html>
`;
}

/** Write HTML + JSON reports to e2e/perf/results/; returns the file paths. */
export function writeReport(
  totalExpected: number,
  phases: PhaseResult[],
): { htmlPath: string; jsonPath: string } {
  const outDir = path.resolve(import.meta.dirname!, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = buildPayload(totalExpected, phases);
  const jsonPath = path.join(outDir, `perf-${stamp}.json`);
  const htmlPath = path.join(outDir, `perf-${stamp}.html`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(htmlPath, renderHtml(payload));
  return { htmlPath, jsonPath };
}
