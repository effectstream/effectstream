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
    config: {
      eventsPerTx: parseInt(process.env["EVENTS_PER_TX"] || "100", 10),
      blockTimeMs: 1000,
      pacingTps: parseInt(process.env["PERF_PHASE_A_TPS"] || "0", 10),
      speedup: parseInt(process.env["PERF_TIME_SPEEDUP"] || "1", 10),
    },
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

// Browser-side render script. Plain ES5-ish string concatenation only.

const BROWSER_JS = `
const C = ['#60a5fa','#fb7185','#34d399','#fbbf24','#a78bfa','#22d3ee'];
function mkChart(id, title, labels, datasets, log){
  const hasY1 = datasets.some(function(d){ return d.yAxisID === 'y1'; });
  const scales = {
    x:{
      title:{display:true,text:'seconds since phase start',color:'#9ca3af'},
      ticks:{maxTicksLimit:12,color:'#9ca3af'},
      grid:{color:'#1f293d'}
    },
    y:{
      beginAtZero:true,
      ticks:{color:'#9ca3af'},
      grid:{color:'#1f293d'},
      title:{display:true,text:hasY1 ? 'NTP Block / Applied' : '',color:'#9ca3af'}
    }
  };
  if (log) {
    scales.y.type = 'logarithmic';
  }
  if (hasY1) {
    scales.y1 = {
      beginAtZero:true,
      position:'right',
      title:{display:true,text:'EVM Block',color:'#9ca3af'},
      ticks:{color:'#9ca3af'},
      grid:{drawOnChartArea:false}
    };
  }
  new Chart(document.getElementById(id), {
    type:'line',
    data:{
      labels: labels,
      datasets: datasets.map(function(d,i){
        const isEvm = d.yAxisID === 'y1';
        const color = isEvm ? '#a78bfa' : C[i%C.length];
        return {
          label:d.label,
          data:d.data,
          borderColor:color,
          backgroundColor:color + '1a',
          borderWidth:2,
          pointRadius:0,
          pointHoverRadius:4,
          tension:0.25,
          spanGaps:true,
          fill: d.fill || false,
          yAxisID: d.yAxisID || 'y'
        };
      })
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        title:{display:true,text:title,color:'#f3f4f6',font:{size:14,weight:'bold'}},
        legend:{display:datasets.length>1,labels:{color:'#e5e7eb'}}
      },
      scales: scales
    }
  });
}

const cfg = DATA.config || { eventsPerTx: '100', blockTimeMs: '1000', pacingTps: '0', speedup: '1' };
document.getElementById('meta').textContent = 'Generated at ' + new Date(DATA.generatedAt).toLocaleString();
document.getElementById('cfg-entries').textContent = DATA.totalExpected.toLocaleString();
document.getElementById('cfg-evt-tx').textContent = cfg.eventsPerTx;
document.getElementById('cfg-block-time').textContent = cfg.blockTimeMs + ' ms';
document.getElementById('cfg-pacing').textContent = cfg.pacingTps > 0 ? cfg.pacingTps + ' tps' : 'Burst';
document.getElementById('cfg-speedup').textContent = cfg.speedup + 'x';
const root = document.getElementById('root');
DATA.phases.forEach(function(ph, pi){
  const sec = document.createElement('section');
  const sm = ph.summary;
  let h = '<div class="phase-header"><h2>' + ph.name + '</h2></div>';
  h += '<div class="kpi-grid">';
  h += '<div class="kpi-card"><div class="kpi-label">Duration</div><div class="kpi-val">' + (ph.durationMs/1000).toFixed(1) + 's</div></div>';
  h += '<div class="kpi-card"><div class="kpi-label">Entries Processed</div><div class="kpi-val">' + ph.entriesProcessed.toLocaleString() + '</div></div>';
  h += '<div class="kpi-card"><div class="kpi-label">Avg Throughput</div><div class="kpi-val text-emerald">' + ph.entriesPerSec.toFixed(0) + '/s</div></div>';
  
  const peakE = sm.peakEntriesPerSec != null ? sm.peakEntriesPerSec.toLocaleString() + '/s' : '-';
  h += '<div class="kpi-card"><div class="kpi-label">Peak Throughput</div><div class="kpi-val text-emerald-bright">' + peakE + '</div></div>';
  
  h += '<div class="kpi-card"><div class="kpi-label">Peak Apply Lag</div><div class="kpi-val text-coral">' + (sm.peakAppliedLagSeconds || 0).toFixed(1) + 's</div><div class="kpi-sub">fetch: ' + (sm.peakLagSeconds || 0).toFixed(1) + 's</div></div>';
  h += '<div class="kpi-card"><div class="kpi-label">Peak Backlog</div><div class="kpi-val text-amber">' + (sm.peakApplyBacklog || 0) + ' blks</div><div class="kpi-sub">buf: ' + (sm.peakMainBuf || 0) + '</div></div>';
  h += '<div class="kpi-card"><div class="kpi-label">Peak Memory (RSS)</div><div class="kpi-val text-violet">' + sm.peakRssMB + ' MB</div><div class="kpi-sub">final: ' + sm.finalRssMB + ' MB</div></div>';
  h += '</div>';
  sec.innerHTML = h;
  const s = ph.series;
  const charts = [
      {id:'lag'+pi, title:'Sync Lag (s): Apply (real) vs Fetch (buf)', ds:[{label:'apply lag', data:s.appliedLag},{label:'fetch lag (buf)', data:s.lagSeconds}]},
    {id:'buf'+pi, title:'Backlog: Apply (blocks) vs Fetch (buffered pages)', ds:[{label:'apply backlog', data:s.applyBacklog},{label:'mainNtp buf', data:s.mainBuf},{label:'evm buf', data:s.evmBuf}]},
    {id:'mem'+pi, title:'Memory (MB)', ds:[{label:'rss', data:s.rssMB, fill:true},{label:'heapUsed', data:s.heapMB, fill:true}]},
    {id:'blk'+pi, title:'Block Progress: Fetch Tip vs Applied', ds:[{label:'mainNtp tip', data:s.mainOwnBlock},{label:'applied', data:s.appliedBlock},{label:'evm tip', data:s.evmOwnBlock, yAxisID:'y1'}]}
  ];
  if (s.entries.some(function(v){ return v != null; }))
    charts.push({id:'ent'+pi, title:'Entries Processed (cumulative)', ds:[{label:'entries', data:s.entries, fill:true}]});
  charts.push({id:'api'+pi, title:'API Latency (ms, log scale)', log:true,
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
    p.style.color = '#9ca3af';
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
<title>Effectstream Perf Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
body{font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;margin:0;padding:40px;color:#f3f4f6;background:#0b0f19}
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1f293d;padding-bottom:24px;margin-bottom:32px;flex-wrap:wrap;gap:20px}
  .brand{display:flex;align-items:center;gap:16px}
  .logo{font-size:32px;background:#1e293b;border:1px solid #3b82f6;border-radius:10px;padding:8px 12px;line-height:1}
  h1{margin:0;font-size:24px;font-weight:700;letter-spacing:-0.02em}
  #meta{color:#9ca3af;font-size:13px;margin:4px 0 0}
  .config-grid{display:flex;gap:12px;flex-wrap:wrap}
  .config-card{background:#151b2c;border:1px solid #222b44;border-radius:8px;padding:10px 16px;display:flex;flex-direction:column;min-width:110px}
  .config-card .label{font-size:10px;text-transform:uppercase;color:#9ca3af;margin-bottom:2px}
  .config-card .val{font-size:14px;font-weight:700;color:#60a5fa}
  
  section{margin:32px 0;padding:24px;background:#0f1626;border:1px solid #1e293b;border-radius:12px}
  .phase-header{border-bottom:1px solid #1f293d;padding-bottom:12px;margin-bottom:20px}
  h2{margin:0;font-size:18px;font-weight:600;color:#f3f4f6}
  
  .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-bottom:28px}
  .kpi-card{background:#151b2c;border:1px solid #222b44;border-radius:8px;padding:16px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
  .kpi-card::after{content:'';position:absolute;top:0;left:0;width:4px;height:100%}
  .kpi-card:nth-child(1)::after{background:#3b82f6}
  .kpi-card:nth-child(2)::after{background:#60a5fa}
  .kpi-card:nth-child(3)::after{background:#10b981}
  .kpi-card:nth-child(4)::after{background:#34d399}
  .kpi-card:nth-child(5)::after{background:#f43f5e}
  .kpi-card:nth-child(6)::after{background:#fbbf24}
  .kpi-card:nth-child(7)::after{background:#8b5cf6}
  
  .kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;margin-bottom:4px}
  .kpi-val{font-size:18px;font-weight:700;color:#f3f4f6}
  .kpi-sub{font-size:10px;color:#6b7280;margin-top:4px}
  .text-emerald{color:#10b981!important}
  .text-emerald-bright{color:#34d399!important}
  .text-coral{color:#fb7185!important}
  .text-amber{color:#fbbf24!important}
  .text-violet{color:#c084fc!important}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:20px;margin-top:12px}
  .card{border:1px solid #222b44;border-radius:8px;padding:16px;background:#151b2c;height:300px}
</style>
</head>
<body>
<header class="header">
  <div class="brand">
    <div class="logo">⚡</div>
    <div>
      <h1>Effectstream Perf Dashboard</h1>
      <p id="meta"></p>
    </div>
  </div>
  <div class="config-grid">
    <div class="config-card">
      <span class="label">Expected Entries</span>
      <span class="val" id="cfg-entries">-</span>
    </div>
    <div class="config-card">
      <span class="label">Events / Tx</span>
      <span class="val" id="cfg-evt-tx">-</span>
    </div>
    <div class="config-card">
      <span class="label">Block Time</span>
      <span class="val" id="cfg-block-time">-</span>
    </div>
    <div class="config-card">
      <span class="label">Pacing Rate</span>
      <span class="val" id="cfg-pacing">-</span>
    </div>
    <div class="config-card">
      <span class="label">Speedup Factor</span>
      <span class="val" id="cfg-speedup">-</span>
    </div>
  </div>
</header>
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
