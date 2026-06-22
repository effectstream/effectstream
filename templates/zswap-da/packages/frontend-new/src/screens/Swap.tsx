// Place Order (Swap) — ported from the mock's swap.jsx SwapPanel + Suggestions,
// wired to reality:
//  - tokens come from the known-tokens registry (TokenPicker)
//  - rate / market / discount / sponsorship / USD come from GET /api/quote
//  - "Create order" builds a real maker offer (st.createOffer → makeIntent +
//    encodeOffer + submit) and records it locally so it's excluded from books
//  - the suggestions rail lists real open offers; "Take" opens the shared
//    confirm dialog and settles via st.takeOffer.
//
// Amounts are integer base units (the ledger has no decimals). Requires the
// browser wallet (Lace / ConnectedAPI); the local JS wallet can't makeIntent.

import { useEffect, useState } from 'react';
import { Coin, Icon, Mark } from '../ui/icons';
import { TokenPicker } from '../ui/TokenPicker';
import { api, type Quote } from '../services/api';
import { fmtAmt, fmtUsd, rateDisplay } from '../state/format';
import type { KnownToken } from '../types';
import type { OfferLeg } from '../services/makerOffer';
import type { Order, ZSwapApp } from '../state/useZSwapApp';

const intize = (v: string) => v.replace(/[^0-9]/g, '');

function RateInline({ value }: { value: number }) {
  const r = rateDisplay(value);
  return <span className="zs-num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.kind === 'plain' ? r.text : (<>{r.mant} × 10<sup style={{ fontSize: '.72em' }}>{r.exp}</sup></>)}</span>;
}

function balanceFor(st: ZSwapApp, token: KnownToken | null): string | null {
  if (!token) return null;
  const map = token.kind === 'shielded' ? st.shieldedBalances : st.unshieldedBalances;
  return map?.[token.token_color] ?? null;
}

function FieldRow({ label, token, value, onValue, onPick, onClear, readOnly, accent, balance, usd }: {
  label: string; token: KnownToken | null; value: string; onValue?: (v: string) => void;
  onPick: () => void; onClear?: () => void; readOnly?: boolean; accent?: boolean; balance?: string | null; usd?: number | null;
}) {
  return (
    <div className="zs-field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="zs-field-label">{label}</span>
        {token && balance != null && (
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Balance <span className="zs-num" style={{ color: 'var(--ink-2)' }}>{balance}</span>
            {!readOnly && <button onClick={() => onValue?.(intize(balance))} className="zs-num" style={{ marginLeft: 7, border: 'none', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>MAX</button>}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input value={value} onChange={(e) => onValue?.(intize(e.target.value))} readOnly={readOnly} placeholder="0" inputMode="numeric"
          className="zs-amount" style={{ color: value ? (accent ? 'var(--accent)' : 'var(--ink)') : 'var(--ink-4)', cursor: readOnly ? 'default' : 'text' }} />
        {token ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <button className="zs-token" onClick={onPick}><Coin sym={token.name} /> {token.name} <Icon.caret /></button>
            <button onClick={onClear} title="Clear token" style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </button>
          </span>
        ) : <button className="zs-token zs-token--empty" onClick={onPick}>Select token <Icon.caret /></button>}
      </div>
      <div className="zs-num" style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>{usd != null ? fmtUsd(usd) : '$0.00'}</div>
    </div>
  );
}

function FastTradeRow({ o, onTake, first }: { o: Order; onTake: (o: Order) => void; first: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', borderTop: first ? 'none' : '1px solid var(--line-2)' }}>
      <div style={{ position: 'relative', width: 46, height: 46, flex: '0 0 auto' }}>
        <span style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}><Coin sym={o.to} size="sm" /></span>
        <span style={{ position: 'absolute', bottom: 0, right: 0, zIndex: 1 }}><Coin sym={o.from} size="sm" /></span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}><span style={{ color: 'var(--ink-3)' }}>Pay </span><span className="zs-num" style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmtAmt(o.amtTo)}</span> <span style={{ fontWeight: 600 }}>{o.to}</span></div>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap', marginTop: 2 }}><span style={{ color: 'var(--ink-3)' }}>Receive </span><span className="zs-num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtAmt(o.amtFrom)}</span> <span style={{ fontWeight: 600 }}>{o.from}</span></div>
      </div>
      <button className="zs-btn zs-btn--primary" style={{ padding: '8px 16px', fontSize: 13, flex: '0 0 auto' }} onClick={() => onTake(o)}><Icon.bolt /> Take</button>
    </div>
  );
}

function Suggestions({ st, from, to }: { st: ZSwapApp; from: KnownToken | null; to: KnownToken | null }) {
  // Counter-orders that let you swap from→to: they GIVE `to` and WANT `from`.
  const matches = (from && to)
    ? st.orders.filter((o) => o.from === to.name && o.to === from.name)
    : [];
  const list = (from && to) ? matches : st.orders;
  const title = (from && to) ? `Open orders · ${from.name} → ${to.name}` : 'Open ZSwaps you can take';

  return (
    <div className="zs-card" style={{ padding: 8, minHeight: 320 }}>
      <div style={{ padding: '12px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}><Icon.bolt style={{ color: 'var(--accent)' }} /> {title}</span>
        <span className="zs-num" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>live</span>
      </div>
      {list.length === 0
        ? <div style={{ padding: '8px 14px 22px', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>{(from && to) ? <>No open orders for <b>{from.name} → {to.name}</b> yet. Enter amounts to create the first one.</> : 'No open offers right now. Create one on the left.'}</div>
        : list.slice(0, 8).map((o, i) => <FastTradeRow key={o.id} o={o} onTake={st.requestTake} first={i === 0} />)}
    </div>
  );
}

export function Swap({ st }: { st: ZSwapApp }) {
  const [from, setFrom] = useState<KnownToken | null>(null);
  const [to, setTo] = useState<KnownToken | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [recvAmt, setRecvAmt] = useState('');
  const [autoPrice, setAutoPrice] = useState(true);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = Number(payAmt) || 0;
  const recv = Number(recvAmt) || 0;
  const bothSel = !!(from && to);
  const sameKind = from && to ? from.kind === to.kind : true;
  const bothShielded = !!(from && to && from.kind === 'shielded' && to.kind === 'shielded');

  // Debounced quote. recvDep keeps auto-mode from looping on its own recv writes.
  const recvDep = autoPrice ? '' : String(recv);
  useEffect(() => {
    if (!from || !to || pay <= 0 || !sameKind) { setQuote(null); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const qres = await api.getQuote(from.token_color, to.token_color, String(pay), autoPrice ? undefined : (recv > 0 ? String(recv) : undefined));
        if (cancelled) return;
        setQuote(qres);
        if (autoPrice) setRecvAmt(qres.suggested_to_amount);
      } catch {
        if (!cancelled) setQuote(null);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.token_color, to?.token_color, pay, autoPrice, sameKind, recvDep]);

  const doSwitch = () => {
    setFrom(to); setTo(from);
    setPayAmt(recvAmt); setRecvAmt(payAmt);
  };

  const post = async () => {
    setError(null);
    if (!from || !to) return;
    if (!sameKind) { setError('Both tokens must be the same privacy kind (all shielded or all unshielded).'); return; }
    if (pay <= 0 || recv <= 0) { setError('Enter both amounts.'); return; }
    setPosting(true);
    try {
      const gives: OfferLeg[] = [{ kind: from.kind, color: from.token_color, amount: BigInt(pay) }];
      const wants: OfferLeg[] = [{ kind: to.kind, color: to.token_color, amount: BigInt(recv) }];
      await st.createOffer(gives, wants);
      setPayAmt(''); setRecvAmt(''); setQuote(null);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
    } finally {
      setPosting(false);
    }
  };

  // primary button state machine (mirrors the mock)
  let label = 'Connect wallet';
  let action: () => void = () => st.connect();
  let disabled = false;
  if (st.wallet) {
    if (!st.canTrade) { label = 'Use the browser wallet (Lace) to create offers'; disabled = true; action = () => {}; }
    else if (!bothSel) { label = 'Select tokens'; disabled = true; action = () => {}; }
    else if (!sameKind) { label = 'Tokens must share privacy kind'; disabled = true; action = () => {}; }
    else if (pay <= 0) { label = 'Enter the amount you pay'; disabled = true; action = () => {}; }
    else if (recv <= 0) { label = 'Enter the amount you want'; disabled = true; action = () => {}; }
    else if (posting) { label = 'Creating…'; disabled = true; action = () => {}; }
    else if (quote && !quote.sponsored) { label = 'Create offer file'; action = post; }
    else { label = bothShielded ? 'Create shielded order' : 'Create order'; action = post; }
  }

  const dPct = quote?.discount != null ? quote.discount * 100 : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 460px) minmax(0, 1fr)', gap: 20, alignItems: 'start', width: '100%' }} className="zs-swap-grid">
      <div style={{ width: '100%' }}>
        {/* hero */}
        <div style={{ background: 'var(--ink)', color: '#fff', padding: '26px 26px 38px', borderRadius: 'var(--r-card) var(--r-card) 0 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18, position: 'relative', zIndex: 1 }}>
            <Mark size={20} color="#fff" /><span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '.12em', opacity: 0.75, whiteSpace: 'nowrap' }}>ZERO-KNOWLEDGE SWAP</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.02, position: 'relative', zIndex: 1 }}>Trade without a trace.</div>
          <div style={{ position: 'absolute', right: -36, top: -46, width: 200, height: 200, borderRadius: '50%', border: '30px solid var(--accent)', opacity: 0.5, filter: 'blur(1px)' }} />
          <div style={{ position: 'absolute', right: 60, bottom: -70, width: 120, height: 120, borderRadius: '50%', border: '18px solid var(--accent)', opacity: 0.22 }} />
        </div>

        <div className="zs-card" style={{ marginTop: -22, position: 'relative', padding: 'var(--pad-card)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldRow label="You pay" token={from} value={payAmt} onValue={setPayAmt} onPick={() => setPicking('from')} onClear={() => { setFrom(null); setQuote(null); }} balance={balanceFor(st, from)} usd={quote?.from_usd ?? null} />
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-9px 0', position: 'relative', zIndex: 2 }}>
            <button className="zs-switch" onClick={doSwitch} title="Switch"><Icon.swap /></button>
          </div>
          <FieldRow label="You receive" token={to} value={recvAmt} onValue={(v) => { setAutoPrice(false); setRecvAmt(v); }} accent onPick={() => setPicking('to')} onClear={() => { setTo(null); setQuote(null); }} usd={quote?.to_usd ?? null} />

          {bothSel && sameKind && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 4px 2px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
                <span onClick={() => setAutoPrice((a) => !a)} style={{ width: 18, height: 18, borderRadius: 5, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: autoPrice ? 'var(--accent)' : 'var(--surface)', border: '1.5px solid ' + (autoPrice ? 'var(--accent)' : 'var(--line)') }}>
                  {autoPrice && <svg viewBox="0 0 16 16" width="11" height="11" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span onClick={() => setAutoPrice((a) => !a)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Auto Market Price</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{autoPrice ? '· balances at the best fillable price' : '· set your own price'}</span>
              </label>

              {pay > 0 && recv > 0 && quote && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 14px', fontSize: 13 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}><Icon.shield style={{ color: 'var(--accent)', flex: '0 0 auto' }} /> Your rate · 1 {from!.name} = <RateInline value={quote.implied_rate ?? 0} /> {to!.name}</span>
                    {dPct != null && <span className="zs-num" style={{ color: dPct >= 0 ? 'var(--pos)' : 'var(--neg)', whiteSpace: 'nowrap', fontWeight: 600 }}>{dPct >= 0 ? '−' : '+'}{Math.abs(dPct).toFixed(1)}% vs market</span>}
                  </div>
                  {!autoPrice && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>Market · 1 {from!.name} = <RateInline value={quote.market_rate} /> {to!.name}</div>}

                  {quote.sponsored ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 11, background: 'var(--pos-soft)', border: '1px solid color-mix(in srgb, var(--pos) 25%, transparent)' }}>
                      <Icon.shield style={{ color: 'var(--pos)', flex: '0 0 auto' }} />
                      <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}><b style={{ color: 'var(--pos)' }}>Celestia fee sponsored.</b> Good trades get filled fast.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', borderRadius: 11, background: 'var(--warn-soft)', border: '1px solid color-mix(in srgb, var(--warn) 22%, transparent)' }}>
                      <span style={{ color: 'var(--warn)', fontWeight: 800, flex: '0 0 auto', lineHeight: 1.3 }}>!</span>
                      <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>This price won't be sponsored to Celestia.
                        <button onClick={() => setAutoPrice(true)} style={{ marginLeft: 6, border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Apply best price</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <button className={'zs-btn zs-btn--block' + (!disabled ? ' zs-btn--primary' : '')} onClick={action} disabled={disabled}
            style={{ marginTop: 8, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer', background: disabled ? 'var(--surface-2)' : undefined, color: disabled ? 'var(--ink-3)' : undefined, boxShadow: disabled ? 'none' : undefined }}>
            {st.wallet && bothShielded && pay > 0 && recv > 0 && <Icon.shield />} {label}
          </button>

          {error && <div style={{ fontSize: 12.5, color: 'var(--neg)', lineHeight: 1.45, wordBreak: 'break-word', marginTop: 4 }}>{error}</div>}

          {bothSel && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
              {bothShielded
                ? <><Icon.shield style={{ color: 'var(--accent)' }} /> <span>Shielded — amounts hidden, settled privately via ZSwap</span></>
                : <><Icon.eye /> <span>Unshielded swap — amounts are visible on-chain</span></>}
            </div>
          )}
        </div>
      </div>

      <Suggestions st={st} from={from} to={to} />

      <TokenPicker open={picking === 'from'} onClose={() => setPicking(null)} tokens={st.knownTokens} excludeColor={to?.token_color} title="Pay with" onPick={(t) => { setFrom(t); setQuote(null); }} />
      <TokenPicker open={picking === 'to'} onClose={() => setPicking(null)} tokens={st.knownTokens} excludeColor={from?.token_color} title="Receive" onPick={(t) => { setTo(t); setQuote(null); }} />
    </div>
  );
}
