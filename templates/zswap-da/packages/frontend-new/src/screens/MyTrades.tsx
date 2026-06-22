// My trades — ported from the mock's mytrades.jsx, wired to the on-device trade
// log (st.myTrades). Created offers and taken offers are recorded locally; the
// stored `blob` is the real bech32m offer, so View/Download export the actual
// shareable offer file. Import pastes a `zswapoffer1…` blob and takes it.

import { useState } from 'react';
import { Coin, Icon } from '../ui/icons';
import { Modal, ModalHead } from '../ui/Modal';
import { fmtAmt, rateDisplay } from '../state/format';
import type { MyTrade } from '../state/myTrades';
import type { ZSwapApp } from '../state/useZSwapApp';

function downloadText(name: string, text: string) {
  const b = new Blob([text], { type: 'text/plain' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function offerName(t: MyTrade) {
  return `zswap-${t.give.sym}-${t.get.sym}-${t.id}.zoffer`;
}

function StatusBadge({ status }: { status: MyTrade['status'] }) {
  const map: Record<string, { c: string; bg: string; label: string }> = {
    open: { c: 'var(--pos)', bg: 'var(--pos-soft)', label: 'Open' },
    completed: { c: 'var(--accent)', bg: 'var(--accent-soft)', label: 'Completed' },
    cancelled: { c: 'var(--ink-3)', bg: 'var(--surface-3)', label: 'Cancelled' },
  };
  const s = map[status] || map.open;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: s.c, background: s.bg, borderRadius: 'var(--r-pill)', padding: '4px 10px', whiteSpace: 'nowrap' }}><Icon.dot /> {s.label}</span>;
}

function Cell({ amt, sym, accent }: { amt: number; sym: string; accent?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
      <Coin sym={sym} size="sm" />
      <span className="zs-num" style={{ fontWeight: 600, fontSize: 13.5, color: accent ? 'var(--accent)' : 'var(--ink)' }}>{fmtAmt(amt)}</span>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sym}</span>
    </span>
  );
}

export function MyTrades({ st }: { st: ZSwapApp }) {
  const trades = st.myTrades;
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [viewing, setViewing] = useState<MyTrade | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dump, setDump] = useState('');
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const preview = dump.trim() ? st.previewOffer(dump) : null;

  const counts = {
    all: trades.length,
    open: trades.filter((t) => t.status === 'open').length,
    completed: trades.filter((t) => t.status === 'completed').length,
  };
  const rows = filter === 'all' ? trades : trades.filter((t) => t.status === filter);

  const doImport = async () => {
    setImporting(true);
    setImportErr(null);
    try {
      await st.importOffer(dump);
      setImportOpen(false);
      setDump('');
    } catch (e: any) {
      setImportErr(e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>My trades</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '6px 0 0' }}>Every order you post or take, kept on this device.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="zs-btn zs-btn--primary" onClick={() => { setImportErr(null); setImportOpen(true); }} style={{ padding: '9px 14px', fontSize: 13 }}><Icon.arrow style={{ transform: 'rotate(-90deg)' }} /> Import ZSwap</button>
          {trades.length > 0 && (
            <button className="zs-btn" onClick={st.clearAllTrades} style={{ padding: '9px 14px', fontSize: 13 }}>Clear all</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 11, padding: '13px 15px', borderRadius: 'var(--r-field)', background: 'var(--warn-soft)', border: '1px solid color-mix(in srgb, var(--warn) 22%, transparent)', marginBottom: 18 }}>
        <span style={{ color: 'var(--warn)', fontWeight: 800, fontSize: 15, flex: '0 0 auto', lineHeight: 1.3 }}>!</span>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          This list is stored <b style={{ color: 'var(--ink)' }}>only in your browser</b>. Shielded ZSwaps are secret — if you clear it, it <b style={{ color: 'var(--ink)' }}>cannot be recovered</b>.
        </div>
      </div>

      <div className="zs-seg" style={{ background: 'var(--bg-tint)', marginBottom: 16 }}>
        {([['all', 'All'], ['open', 'Open'], ['completed', 'Completed']] as const).map(([id, lbl]) => (
          <button key={id} className="zs-nav-tab" aria-selected={filter === id} onClick={() => setFilter(id)}
            style={filter === id ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 3px rgba(10,12,20,.08)' } : { background: 'transparent', color: 'var(--ink-2)' }}>
            {lbl} <span className="zs-num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{counts[id]}</span>
          </button>
        ))}
      </div>

      <div className="zs-card" style={{ padding: '16px 8px 8px' }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>No trades yet</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', margin: '6px 0 16px' }}>Post or take a ZSwap and it'll show up here.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="zs-table">
              <thead><tr>
                <th>Offered</th><th>Requested</th><th style={{ textAlign: 'right' }}>Price</th><th>Date</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((t) => {
                  const price = t.give.amt > 0 ? t.get.amt / t.give.amt : 0;
                  const r = rateDisplay(price);
                  const d = new Date(t.at);
                  return (
                    <tr key={t.id}>
                      <td><Cell amt={t.give.amt} sym={t.give.sym} /></td>
                      <td><Cell amt={t.get.amt} sym={t.get.sym} accent /></td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="zs-num" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.kind === 'plain' ? r.text : (<>{r.mant} × 10<sup style={{ fontSize: '.72em' }}>{r.exp}</sup></>)} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{t.get.sym}</span></div>
                      </td>
                      <td>
                        <div className="zs-num" style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{d.toISOString().slice(0, 10)}</div>
                        <div className="zs-num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d.toTimeString().slice(0, 8)}</div>
                      </td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><StatusBadge status={t.status} />{t.shielded && <Icon.shield style={{ color: 'var(--accent)' }} />}</div></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button onClick={() => setViewing(t)} title="View offer file" className="zs-btn" style={{ padding: '6px 11px', fontSize: 12.5 }} disabled={!t.blob}>View</button>
                          <button onClick={() => st.clearTrade(t.id)} title="Clear from this device" className="zs-btn" style={{ padding: '6px 11px', fontSize: 12.5 }}>Clear</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* offer-file blob viewer */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} width={520}>
        {viewing && (
          <>
            <ModalHead title="Offer file" onClose={() => setViewing(null)} />
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Coin sym={viewing.give.sym} size="sm" /><span className="zs-num" style={{ fontWeight: 600, fontSize: 13 }}>{fmtAmt(viewing.give.amt)} {viewing.give.sym}</span>
                <Icon.arrow style={{ color: 'var(--ink-3)' }} />
                <Coin sym={viewing.get.sym} size="sm" /><span className="zs-num" style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>{fmtAmt(viewing.get.amt)} {viewing.get.sym}</span>
                {viewing.shielded && <span className="zs-badge-shield" style={{ marginLeft: 'auto' }}><Icon.shield /> Shielded</span>}
              </div>
              <textarea readOnly value={viewing.blob ?? '(no offer blob stored for this trade)'} onFocus={(e) => e.currentTarget.select()}
                style={{ width: '100%', height: 240, resize: 'none', borderRadius: 'var(--r-field)', border: '1px solid var(--line)', background: 'var(--surface-2)', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, color: 'var(--ink-2)', outline: 'none', boxSizing: 'border-box', wordBreak: 'break-all' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="zs-btn" style={{ flex: '0 0 auto', padding: '11px 14px', fontSize: 13.5 }} disabled={!viewing.blob} onClick={() => { if (viewing.blob) { navigator.clipboard?.writeText(viewing.blob); st.toast('Offer file copied', 'ok'); } }}>Copy</button>
                <button className="zs-btn zs-btn--primary" style={{ flex: 1, justifyContent: 'center', padding: '11px', fontSize: 14 }} disabled={!viewing.blob} onClick={() => viewing.blob && downloadText(offerName(viewing), viewing.blob)}><Icon.arrow style={{ transform: 'rotate(90deg)' }} /> Download .zoffer</button>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* import + take a pasted offer blob */}
      <Modal open={importOpen} onClose={() => !importing && setImportOpen(false)} width={480}>
        <ModalHead title="Import ZSwap" onClose={() => !importing && setImportOpen(false)} />
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 12px' }}>Paste a <span className="zs-num">zswapoffer1…</span> offer blob shared with you. We'll balance and settle it via the batcher.</p>
          <textarea value={dump} onChange={(e) => setDump(e.target.value)} autoFocus placeholder="zswapoffer1…"
            style={{ width: '100%', height: 160, resize: 'none', borderRadius: 'var(--r-field)', border: '1px solid var(--line)', background: 'var(--surface-2)', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-2)', outline: 'none', boxSizing: 'border-box', wordBreak: 'break-all' }} />
          {preview && (preview.pays.length > 0 || preview.gets.length > 0) ? (
            <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 'var(--r-field)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: 'var(--ink-3)' }}>You pay</span>
              {preview.pays.map((l, i) => <span key={'p' + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Coin sym={l.sym} size="sm" /><span className="zs-num" style={{ fontWeight: 700 }}>{fmtAmt(l.amt)}</span> {l.sym}</span>)}
              <Icon.arrow style={{ color: 'var(--ink-3)' }} />
              <span style={{ color: 'var(--ink-3)' }}>receive</span>
              {preview.gets.map((l, i) => <span key={'g' + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Coin sym={l.sym} size="sm" /><span className="zs-num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtAmt(l.amt)}</span> {l.sym}</span>)}
              {preview.shielded && <span className="zs-badge-shield" style={{ marginLeft: 'auto' }}><Icon.shield /> Shielded</span>}
            </div>
          ) : dump.trim() ? (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>Couldn't decode this blob — it may be malformed or for a different network.</div>
          ) : null}
          {importErr && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--neg)', lineHeight: 1.45, wordBreak: 'break-word' }}>{importErr}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="zs-btn" style={{ flex: '0 0 auto', padding: '12px 16px', fontSize: 14 }} disabled={importing} onClick={() => setImportOpen(false)}>Cancel</button>
            <button className="zs-btn zs-btn--primary" style={{ flex: 1, justifyContent: 'center', padding: 12, fontSize: 14, opacity: dump.trim() && !importing ? 1 : 0.5, cursor: dump.trim() && !importing ? 'pointer' : 'default' }} disabled={!dump.trim() || importing} onClick={doImport}><Icon.bolt /> {importing ? 'Settling…' : 'Take ZSwap'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
