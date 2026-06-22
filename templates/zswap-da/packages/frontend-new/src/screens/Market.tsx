// Order book tab — pair header + 24h stats + depth book (asks/bids, click-to-
// select range → Take) + trade history. Pair discovery comes from REAL open
// orders (st.orders); the depth ladder / stats / history come from the backend
// GET /api/chart/** endpoints (synthetic for now behind the API — the frontend
// no longer fabricates them). The depth "Take" is indicative (the rows are
// aggregate market data, not individual offers) → it routes you to live offers
// you can actually settle from Place Order.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Coin, Icon, isShielded } from '../ui/icons';
import { api, type ChartDepth, type ChartHistoryRow, type ChartStats } from '../services/api';
import { shortToken } from '../utils';
import type { ZSwapApp } from '../state/useZSwapApp';

type Side = 'ask' | 'bid';
type View = 'both' | 'asks' | 'bids';
interface Pair { base: string; quote: string }

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return '0';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return parseFloat(p.toPrecision(3)).toString();
}
function fmtQty(q: number): string {
  if (!Number.isFinite(q)) return '0';
  if (q >= 1000) return q.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (q >= 1) return q.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return parseFloat(q.toPrecision(3)).toString();
}

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="zs-tag" style={{ marginBottom: 5 }}>{label}</div>
      <div className="zs-num" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>{children}</div>
      {sub && <div className="zs-num" style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Market({ st, onGo }: { st: ZSwapApp; onGo?: (page: 'swap') => void }) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [view, setView] = useState<View>('both');
  const [nonce, setNonce] = useState(0);
  const [pickOpen, setPickOpen] = useState(false);
  const [pairQuery, setPairQuery] = useState('');
  const pickRef = useRef<HTMLDivElement>(null);
  const base = pair ? pair.base : '';
  const quote = pair ? pair.quote : '';

  // name → color map (chart endpoints key on colors; orders carry names)
  const colorByName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of st.knownTokens) m[t.name] = t.token_color;
    return m;
  }, [st.knownTokens]);
  const baseColor = colorByName[base] ?? base;
  const quoteColor = colorByName[quote] ?? quote;

  const [depth, setDepth] = useState<ChartDepth | null>(null);
  const [stats, setStats] = useState<ChartStats | null>(null);
  const [history, setHistory] = useState<ChartHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pair) { setDepth(null); setStats(null); setHistory([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getChartDepth(baseColor, quoteColor),
      api.getChartStats(baseColor, quoteColor),
      api.getChartHistory(baseColor, quoteColor),
    ])
      .then(([d, s, h]) => { if (!cancelled) { setDepth(d); setStats(s); setHistory(h); } })
      .catch(() => { if (!cancelled) { setDepth(null); setStats(null); setHistory([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair?.base, pair?.quote, baseColor, quoteColor, nonce]);

  useEffect(() => {
    const off = (e: PointerEvent) => { if (pickRef.current && !pickRef.current.contains(e.target as Node)) setPickOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, []);

  // Pairs with liquidity from real open orders; opposite directions merge.
  const liquidPairs = useMemo(() => {
    const orders = st.orders || [];
    const m: Record<string, { count: number; dirs: Record<string, number> }> = {};
    orders.forEach((o) => {
      const key = [o.from, o.to].sort().join('/');
      if (!m[key]) m[key] = { count: 0, dirs: {} };
      m[key].count++;
      const dk = o.from + '/' + o.to;
      m[key].dirs[dk] = (m[key].dirs[dk] || 0) + 1;
    });
    return Object.values(m).map((p) => {
      const [top] = Object.entries(p.dirs).sort((a, b) => b[1] - a[1]);
      const [b0, q0] = top[0].split('/');
      return { base: b0, quote: q0, count: p.count };
    }).sort((a, b) => b.count - a.count).slice(0, 24);
  }, [st.orders]);

  const q = pairQuery.trim().toLowerCase();
  const shownPairs = q ? liquidPairs.filter((p) => (p.base + ' ' + p.quote).toLowerCase().includes(q)) : liquidPairs;

  // depth-derived locals (empty-safe)
  const asks = depth?.asks ?? [];
  const bids = depth?.bids ?? [];
  const mid = depth?.mid ?? 0;
  const maxTotal = depth?.maxTotal ?? 1;
  const spread = depth?.spread ?? 0;
  const change24 = stats?.change24 ?? 0;
  const lastUp = change24 >= 0;

  // —— row selection: hover previews a cumulative range, click commits ——
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<{ side: Side; idx: number } | null>(null);
  useEffect(() => { setActive({}); setHover(null); }, [base, quote, nonce, view]);

  const keyOf = (side: Side, idx: number) => side + idx;
  const rangeKeys = (side: Side, idx: number) => {
    const arr = side === 'ask' ? asks : bids;
    const keys: string[] = [];
    if (side === 'ask') { for (let i = idx; i < arr.length; i++) keys.push(keyOf(side, i)); }
    else { for (let i = 0; i <= idx; i++) keys.push(keyOf(side, i)); }
    return keys;
  };
  const activeSide = useMemo<Side | null>(() => {
    const k = Object.keys(active)[0];
    return k ? (k.startsWith('ask') ? 'ask' : 'bid') : null;
  }, [active]);
  const previewKeys = hover && (!activeSide || activeSide === hover.side) ? rangeKeys(hover.side, hover.idx) : [];
  const isActive = (side: Side, idx: number) => !!active[keyOf(side, idx)];
  const isPreview = (side: Side, idx: number) => !isActive(side, idx) && previewKeys.indexOf(keyOf(side, idx)) >= 0;

  const clickRow = (side: Side, idx: number) => {
    const k = keyOf(side, idx);
    setActive((a) => {
      if (a[k]) { const n = { ...a }; delete n[k]; return n; }
      const base0: Record<string, boolean> = activeSide && activeSide !== side ? {} : { ...a };
      rangeKeys(side, idx).forEach((kk) => (base0[kk] = true));
      return base0;
    });
  };

  const effSide: Side | null = hover ? (activeSide && activeSide !== hover.side ? activeSide : hover.side) : activeSide;
  const summary = useMemo(() => {
    if (!effSide) return null;
    const arr = effSide === 'ask' ? asks : bids;
    const rows = arr.filter((_, i) => isActive(effSide, i) || previewKeys.indexOf(keyOf(effSide, i)) >= 0);
    if (!rows.length) return null;
    const baseAmt = rows.reduce((s, r) => s + r.amt, 0);
    const quoteAmt = rows.reduce((s, r) => s + r.amt * r.price, 0);
    const committed = Object.keys(active).length > 0;
    return effSide === 'ask'
      ? { pay: quoteAmt, paySym: quote, get: baseAmt, getSym: base, n: rows.length, preview: !committed }
      : { pay: baseAmt, paySym: base, get: quoteAmt, getSym: quote, n: rows.length, preview: !committed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hover, base, quote, depth]);

  const takeDepth = () => {
    // Depth rows are aggregate market data, not individual settle-able offers.
    // Point the user at real offers (Place Order suggestions / Take).
    st.toast('Depth is indicative — take a live offer from Place Order.');
    onGo?.('swap');
  };

  const Row = ({ r, side, idx }: { r: ChartDepth['asks'][number]; side: Side; idx: number }) => {
    const pct = Math.min(100, (r.total / maxTotal) * 100);
    const col = side === 'ask' ? 'var(--neg)' : 'var(--pos)';
    const bg = side === 'ask' ? 'rgba(229,72,77,.09)' : 'rgba(14,159,110,.10)';
    const on = isActive(side, idx);
    const prev = isPreview(side, idx);
    const dPct = (r.price / mid - 1) * 100;
    return (
      <div onClick={() => clickRow(side, idx)} onMouseEnter={() => setHover({ side, idx })}
        title={on ? 'Click to remove this row' : 'Click to select up to here'}
        style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', padding: '5px 12px', cursor: 'pointer', background: on ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : prev ? 'var(--accent-soft)' : undefined, boxShadow: on ? 'inset 2px 0 0 var(--accent)' : undefined }}>
        <span style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: pct + '%', background: bg }} />
        <span className="zs-num" style={{ position: 'relative', fontSize: 13, fontWeight: 600, color: col, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {fmtPrice(r.price)}
          {(on || prev) && <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 600 }}>{dPct >= 0 ? '↑' : '↓'}{Math.abs(dPct).toFixed(2)}%</span>}
        </span>
        <span className="zs-num" style={{ position: 'relative', fontSize: 13, textAlign: 'right', color: 'var(--ink)' }}>{fmtQty(r.amt)}</span>
        <span className="zs-num" style={{ position: 'relative', fontSize: 13, textAlign: 'right', color: 'var(--ink-2)' }}>{fmtQty(r.total)}</span>
      </div>
    );
  };

  const ViewBtn = ({ id, children }: { id: View; children: React.ReactNode }) => (
    <button onClick={() => setView(id)} title={id} style={{ width: 26, height: 22, borderRadius: 6, border: '1px solid ' + (view === id ? 'var(--accent-line)' : 'var(--line)'), background: view === id ? 'var(--accent-soft)' : 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>{children}</button>
  );

  const nActive = Object.keys(active).length;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* pair header + stats */}
      <div className="zs-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: pair ? 18 : 0 }}>
          <div ref={pickRef} style={{ position: 'relative' }}>
            <button onClick={() => setPickOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', padding: pair ? '7px 14px 7px 9px' : '10px 16px', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
              {pair ? (
                <><span style={{ display: 'inline-flex', alignItems: 'center' }}><Coin sym={base} size="sm" /><span style={{ margin: '0 3px', color: 'var(--ink-3)', fontSize: 11, position: 'relative', zIndex: 2 }}>→</span><Coin sym={quote} size="sm" /></span> {base}/{quote}</>
              ) : (<>Select a pair</>)}
              <Icon.caret style={{ color: 'var(--ink-3)' }} />
            </button>
            {pickOpen && (
              <div className="zs-card" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 300, padding: 8, zIndex: 70, maxHeight: 380, display: 'flex', flexDirection: 'column', boxShadow: 'var(--sh-pop)' }}>
                <div className="zs-field" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <Icon.search style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
                  <input autoFocus value={pairQuery} onChange={(e) => setPairQuery(e.target.value)} placeholder="Search token or pair" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)' }} />
                  {pairQuery && <button onClick={() => setPairQuery('')} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, fontSize: 14, flex: '0 0 auto' }}>✕</button>}
                </div>
                <div style={{ overflowY: 'auto' }}>
                  <div className="zs-tag" style={{ padding: '6px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}><Icon.spark style={{ color: 'var(--accent)' }} /> Pairs with liquidity</div>
                  {shownPairs.length === 0 && <div style={{ padding: '6px 10px 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>{q ? `No pairs match “${pairQuery}”.` : 'No open liquidity right now.'}</div>}
                  {shownPairs.map((p, i) => (
                    <button key={i} onClick={() => { setPair({ base: p.base, quote: p.quote }); setPickOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', border: 'none', background: pair && pair.base === p.base && pair.quote === p.quote ? 'var(--surface-2)' : 'transparent', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}><Coin sym={p.base} size="sm" /><span style={{ margin: '0 3px', color: 'var(--ink-3)', fontSize: 11, position: 'relative', zIndex: 2 }}>→</span><Coin sym={p.quote} size="sm" /></div>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{p.base}<span style={{ color: 'var(--ink-3)', fontWeight: 500 }}> / {p.quote}</span></span>
                      <span className="zs-num" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.count} open</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {pair && (
            <>
              <button onClick={() => setPair({ base: quote, quote: base })} title="Flip direction" style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}><Icon.swap /></button>
              <button onClick={() => setPair(null)} title="Clear pair" style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}><svg viewBox="0 0 16 16" width="13" height="13" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></button>
            </>
          )}
          {pair && isShielded(base) && isShielded(quote) && <span className="zs-badge-shield"><Icon.shield /> Shielded market</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setNonce((n) => n + 1)} className="zs-btn zs-btn--ghost" style={{ padding: '8px 12px', fontSize: 13 }}>Refresh</button>
          </div>
        </div>

        {pair && stats && (
          <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Stat label="Last price">{fmtPrice(stats.last)} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{quote}</span></Stat>
            <Stat label="24h"><span style={{ color: lastUp ? 'var(--pos)' : 'var(--neg)' }}>{lastUp ? '+' : ''}{change24.toFixed(2)}%</span></Stat>
            <Stat label="High">{fmtPrice(stats.high)}</Stat>
            <Stat label="Low">{fmtPrice(stats.low)}</Stat>
            <Stat label="Volume" sub={fmtQty(stats.volume_quote) + ' ' + quote}>{fmtQty(stats.volume_base)} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{base}</span></Stat>
            <Stat label={base + ' asset ID'}>{shortToken(baseColor)}</Stat>
          </div>
        )}
      </div>

      {/* book + history — or suggestions when no pair is selected */}
      {!pair ? (
        <div className="zs-card" style={{ padding: 22, minHeight: 420, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon.spark style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.02em' }}>Markets with liquidity</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: '0 0 16px' }}>Pick a pair to open its order book and trade history. These have open ZSwaps right now.</p>

          <div className="zs-field" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, maxWidth: 360 }}>
            <Icon.search style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
            <input value={pairQuery} onChange={(e) => setPairQuery(e.target.value)} placeholder="Search token or pair" style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)' }} />
            {pairQuery && <button onClick={() => setPairQuery('')} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, fontSize: 14, flex: '0 0 auto' }}>✕</button>}
          </div>

          {shownPairs.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, padding: '30px 0' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>{q ? `No pairs match “${pairQuery}”` : 'No open liquidity right now'}</div>
              <button className="zs-btn zs-btn--primary" onClick={() => onGo?.('swap')}>Create the first order <Icon.arrow /></button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {shownPairs.map((p, i) => {
                const sh = isShielded(p.base) && isShielded(p.quote);
                return (
                  <button key={i} onClick={() => setPair({ base: p.base, quote: p.quote })} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 'var(--r-field)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}><Coin sym={p.base} /><span style={{ margin: '0 4px', color: 'var(--ink-3)', position: 'relative', zIndex: 2 }}>→</span><Coin sym={p.quote} /></span>
                      <span style={{ fontWeight: 700, fontSize: 14.5 }}>{p.base}<span style={{ color: 'var(--ink-3)', fontWeight: 500 }}> / {p.quote}</span></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="zs-tag">Open ZSwaps</span>
                      <span className={sh ? 'zs-badge-shield' : 'zs-pill'} style={{ padding: '4px 9px', fontSize: 11 }}>{p.count} open</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 'auto', paddingTop: 18, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Don't see the pair you want?</span>
            <button className="zs-btn zs-btn--primary" style={{ padding: '9px 16px', fontSize: 13.5 }} onClick={() => onGo?.('swap')}>Add your own · Swap now <Icon.arrow /></button>
          </div>
        </div>
      ) : (
        <div className="zs-grid2" style={{ gap: 16, alignItems: 'start' }}>
          {/* ORDER BOOK */}
          <div className="zs-card" style={{ overflow: 'hidden' }} onMouseLeave={() => setHover(null)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>Order Book</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <ViewBtn id="both"><svg viewBox="0 0 16 16" width="12" height="12"><rect x="2" y="2" width="5" height="5" rx="1" fill="var(--neg)" /><rect x="2" y="9" width="5" height="5" rx="1" fill="var(--pos)" /><rect x="9" y="2" width="5" height="2" rx="1" fill="var(--ink-4)" /><rect x="9" y="6" width="5" height="2" rx="1" fill="var(--ink-4)" /><rect x="9" y="10" width="5" height="2" rx="1" fill="var(--ink-4)" /></svg></ViewBtn>
                  <ViewBtn id="asks"><svg viewBox="0 0 16 16" width="12" height="12"><rect x="2" y="2" width="12" height="3.4" rx="1" fill="var(--neg)" /><rect x="2" y="7" width="9" height="2" rx="1" fill="var(--ink-4)" /><rect x="2" y="11" width="9" height="2" rx="1" fill="var(--ink-4)" /></svg></ViewBtn>
                  <ViewBtn id="bids"><svg viewBox="0 0 16 16" width="12" height="12"><rect x="2" y="3" width="9" height="2" rx="1" fill="var(--ink-4)" /><rect x="2" y="7" width="9" height="2" rx="1" fill="var(--ink-4)" /><rect x="2" y="10.6" width="12" height="3.4" rx="1" fill="var(--pos)" /></svg></ViewBtn>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 12px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              <span>Price ({quote})</span><span style={{ textAlign: 'right' }}>Amount ({base})</span><span style={{ textAlign: 'right' }}>Total ({base})</span>
            </div>

            {!depth ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>{loading ? 'Loading order book…' : 'No market data.'}</div>
            ) : (
              <>
                {view !== 'bids' && asks.map((r, i) => <Row key={'a' + i} r={r} side="ask" idx={i} />)}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--line-2)', borderBottom: '1px solid var(--line-2)' }}>
                  <span className="zs-num" style={{ fontSize: 17, fontWeight: 700, color: lastUp ? 'var(--pos)' : 'var(--neg)' }}>{fmtPrice(mid)}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>spread <span className="zs-num">{fmtPrice(spread)}</span></span>
                </div>

                {view !== 'asks' && bids.map((r, i) => <Row key={'b' + i} r={r} side="bid" idx={i} />)}

                {summary ? (
                  <div style={{ padding: '14px 16px', borderTop: '1px solid var(--line)', background: summary.preview ? 'var(--surface-2)' : 'var(--accent-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="zs-tag">{summary.preview ? 'Preview' : `${summary.n} level${summary.n > 1 ? 's' : ''} selected`}</span>
                      {summary.preview && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>click to select</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>You pay</span>
                      <span className="zs-num" style={{ fontSize: 14, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQty(summary.pay)} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{summary.paySym}</span></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: summary.preview ? 0 : 12 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>You receive</span>
                      <span className="zs-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQty(summary.get)} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{summary.getSym}</span></span>
                    </div>
                    {!summary.preview && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="zs-btn" style={{ padding: '11px 14px', fontSize: 13.5, flex: '0 0 auto' }} onClick={() => { setActive({}); setHover(null); }}>Clear</button>
                        <button className="zs-btn zs-btn--primary" style={{ flex: 1, justifyContent: 'center', padding: '11px', fontSize: 14 }} onClick={takeDepth}><Icon.bolt /> <span>{`Take offer · ${nActive} level${nActive > 1 ? 's' : ''}`}</span></button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>You don't find a trade for you?</span>
                    <button className="zs-btn zs-btn--primary" style={{ padding: '9px 16px', fontSize: 13.5 }} onClick={() => onGo?.('swap')}>Add your own · Swap now <Icon.arrow /></button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* TRADE HISTORY */}
          <div className="zs-card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>Trade History</span>
              <span className="zs-pill"><Icon.clock /> {base}/{quote}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', padding: '10px 12px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              <span>Price ({quote})</span><span style={{ textAlign: 'right' }}>Amount ({base})</span><span style={{ textAlign: 'right' }}>Time</span>
            </div>
            <div style={{ maxHeight: 432, overflowY: 'auto' }}>
              {history.length === 0 && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>{loading ? 'Loading…' : 'No trades.'}</div>}
              {(() => {
                const dayAgo = Date.now() - 864e5;
                const rows: React.ReactNode[] = [];
                let split = false;
                history.forEach((h, i) => {
                  const at = new Date(h.at);
                  if (!split && at.getTime() < dayAgo) { split = true; rows.push(<div key="sep" style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textAlign: 'right', borderTop: '1px solid var(--line-2)' }}>Last 7 days</div>); }
                  else if (i === 0) rows.push(<div key="sep0" style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textAlign: 'right' }}>Last 24 hours</div>);
                  const ts = at.toISOString().slice(0, 16).replace('T', ' ');
                  rows.push(
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', padding: '5px 12px', alignItems: 'center' }}>
                      <span className="zs-num" style={{ fontSize: 13, fontWeight: 600, color: h.up ? 'var(--pos)' : 'var(--neg)' }}>{fmtPrice(h.price)}</span>
                      <span className="zs-num" style={{ fontSize: 13, textAlign: 'right', color: 'var(--ink)' }}>{fmtQty(h.amt)}</span>
                      <span className="zs-num" style={{ fontSize: 12, textAlign: 'right', color: 'var(--ink-3)' }}>{ts}</span>
                    </div>,
                  );
                });
                return rows;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
