// Place Order — ported from the mock's swap.jsx SwapPanel, wired to reality:
//  - tokens come from the known-tokens registry (TokenPicker)
//  - rate / market / discount / sponsorship / USD come from GET /v1/quote
//  - "Create order" builds a real maker offer (st.createOffer → makeIntent +
//    encodeOffer + submit) and records it locally so it's excluded from books
//
// The form is exported as `PlaceOrderForm` so it can render both full-width and
// inside the bottom console dock (`compact`). `Swap` keeps the standalone hero
// layout for any full-page use.
//
// Amounts are integer base units (the ledger has no decimals). Requires the
// browser wallet (Lace / ConnectedAPI); the local JS wallet can't makeIntent.

import { useEffect, useState } from 'react';
import { Coin, Icon, Mark } from '../ui/icons';
import { TokenPicker } from '../ui/TokenPicker';
import { api, type Quote } from '../services/api';
import { log } from '../lib/log';
import { fmtUsd, rateDisplay } from '../state/format';
import { describeQuote } from '../state/reference';
import type { KnownToken } from '../types';
import type { OfferLeg } from '../services/makerOffer';
import type { ZSwapApp } from '../state/useZSwapApp';

/**
 * Parse a typed amount into exact integer base units.
 *
 * Returns null for anything that isn't a whole non-negative number — including
 * decimals, which the ledger has no notion of. Rejecting them here beats
 * `BigInt(1.5)` throwing a bare RangeError from inside the submit path.
 */
function parseUnits(raw: string): bigint | null {
  const s = raw.trim().replace(/[,_\s]/g, '');
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

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

function FieldRow({ label, token, value, onValue, onPick, onClear, readOnly, accent, balance, usd, compact }: {
  label: string; token: KnownToken | null; value: string; onValue?: (v: string) => void;
  onPick: () => void; onClear?: () => void; readOnly?: boolean; accent?: boolean; balance?: string | null; usd?: number | null; compact?: boolean;
}) {
  return (
    <div className="zs-field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 7 : 12 }}>
        <span className="zs-field-label">{label}</span>
        {token && balance != null && (
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Balance <span className="zs-num" style={{ color: 'var(--ink-2)' }}>{balance}</span>
            {!readOnly && <button onClick={() => onValue?.(intize(balance))} className="zs-num" style={{ marginLeft: 7, border: 'none', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>MAX</button>}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input value={value} onChange={(e) => onValue?.(intize(e.target.value))} readOnly={readOnly} placeholder="0" inputMode="numeric"
          className="zs-amount" style={{ fontSize: compact ? 24 : undefined, color: value ? (accent ? 'var(--accent)' : 'var(--ink)') : 'var(--ink-4)', cursor: readOnly ? 'default' : 'text' }} />
        {token ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <button className="zs-token" onClick={onPick}><Coin sym={token.name} /> {token.name} <Icon.caret /></button>
            <button onClick={onClear} title="Clear token" style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </button>
          </span>
        ) : <button className="zs-btn" onClick={onPick} style={{ padding: '9px 12px', gap: 8 }}>Select token <Icon.caret style={{ color: 'var(--ink-3)' }} /></button>}
      </div>
      <div className="zs-num" style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>{usd != null ? fmtUsd(usd) : '$0.00'}</div>
    </div>
  );
}

/** The order-entry card on its own — used full-width and inside the console dock.
 *  `requestPayPicker` is a one-shot signal (consumed via onPayPickerHandled) that
 *  opens the "Pay with" token picker, so an external CTA can kick off the flow. */
export function PlaceOrderForm({ st, compact, requestPayPicker, onPayPickerHandled }: {
  st: ZSwapApp; compact?: boolean; requestPayPicker?: boolean; onPayPickerHandled?: () => void;
}) {
  const [from, setFrom] = useState<KnownToken | null>(null);
  const [to, setTo] = useState<KnownToken | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [recvAmt, setRecvAmt] = useState('');
  const [autoPrice, setAutoPrice] = useState(true);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [posting, setPosting] = useState(false);
  const [postStatus, setPostStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The node's machine code for the last failure. NOT_SPONSORED (422) is the
  // one the maker can act on from here, so it gets the same "Apply best price"
  // escape hatch as the pre-submit warning.
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // External "start the order flow" trigger → open the Pay-with picker once.
  useEffect(() => {
    if (requestPayPicker) { setPicking('from'); onPayPickerHandled?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestPayPicker]);

  // Amounts are parsed straight from the input STRING to bigint. Going via
  // Number() first would silently round anything past 2^53 (a double's exact
  // integer range) and the BigInt() afterwards would faithfully preserve the
  // corrupted value — so the wallet would build an offer for an amount the user
  // never typed. Ledger amounts are u128 integer base units, so a plain decimal
  // string is the whole grammar.
  const payBig = parseUnits(payAmt);
  const recvBig = parseUnits(recvAmt);
  const bothSel = !!(from && to);
  const sameKind = from && to ? from.kind === to.kind : true;
  const bothShielded = !!(from && to && from.kind === 'shielded' && to.kind === 'shielded');

  // Canonical decimal strings — the quote endpoint takes strings, so the whole
  // path stays exact with no double round-trip.
  const payStr = payBig?.toString() ?? '';
  const recvStr = recvBig?.toString() ?? '';

  // Debounced quote. recvDep keeps auto-mode from looping on its own recv writes.
  const recvDep = autoPrice ? '' : recvStr;
  useEffect(() => {
    if (!from || !to || payBig === null || payBig <= 0n || !sameKind) { setQuote(null); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const qres = await api.getQuote(from.token_color, to.token_color, payStr, autoPrice ? undefined : (recvBig && recvBig > 0n ? recvStr : undefined));
        if (cancelled) return;
        setQuote(qres);
        if (autoPrice) setRecvAmt(qres.suggested_to_amount);
      } catch {
        if (!cancelled) setQuote(null);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.token_color, to?.token_color, payStr, autoPrice, sameKind, recvDep]);

  const doSwitch = () => {
    setFrom(to); setTo(from);
    setPayAmt(recvAmt); setRecvAmt(payAmt);
  };

  const post = async () => {
    setError(null);
    setErrorCode(null);
    if (!from || !to) return;
    if (!sameKind) { setError('Both tokens must be the same privacy kind (all shielded or all unshielded).'); return; }
    if (payAmt.trim() !== '' && payBig === null) { setError('Amounts are whole base units — no decimals or separators.'); return; }
    if (recvAmt.trim() !== '' && recvBig === null) { setError('Amounts are whole base units — no decimals or separators.'); return; }
    if (payBig === null || recvBig === null || payBig <= 0n || recvBig <= 0n) { setError('Enter both amounts.'); return; }
    setPosting(true);
    let phase = 'Building offer in wallet…';
    const onStatus = (s: string) => { phase = s; setPostStatus(s); log.info('[create-offer]', s); };
    onStatus(phase);
    try {
      const gives: OfferLeg[] = [{ kind: from.kind, color: from.token_color, amount: payBig }];
      const wants: OfferLeg[] = [{ kind: to.kind, color: to.token_color, amount: recvBig }];
      log.info('[create-offer] start', { pay: payBig.toString(), recv: recvBig.toString(), from: from.name, to: to.name, kind: from.kind, fromColor: from.token_color, toColor: to.token_color });
      // Bound the whole flow so a hung wallet/proof step can't sit on "Creating…"
      // forever — surface a clear, retryable error naming the phase it stuck on.
      await Promise.race([
        st.createOffer(gives, wants, { onStatus }),
        new Promise((_, rej) => setTimeout(
          () => rej(new Error(`Timed out during "${phase}" — that step didn't respond within 180s. Nothing was posted; please try again.`)),
          180_000,
        )),
      ]);
      setPayAmt(''); setRecvAmt(''); setQuote(null);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      log.error('[create-offer] failed during', phase, e);
      // ApiError.message IS the node's `reason` (see services/api.ts), so a
      // 422 NOT_SPONSORED explains itself here verbatim - numbers included -
      // instead of reading "Failed to submit offer".
      setError(msg);
      setErrorCode(typeof e?.code === 'string' ? e.code : null);
    } finally {
      setPosting(false);
      setPostStatus('');
    }
  };

  // Maker can only offer to pay tokens it holds. Compared in bigint: balances
  // are raw integer strings, so Number() on either side could round two
  // distinct amounts onto the same double and let an unaffordable offer through
  // this gate. (createOffer re-checks authoritatively in bigint regardless.)
  const payBalance = balanceFor(st, from);
  const payBalanceBig = parseUnits(String(payBalance ?? '0')) ?? 0n;
  const insufficientPay = !!from && payBig !== null && payBig > 0n && payBalanceBig < payBig;

  // primary button state machine (mirrors the mock)
  let label = 'Connect wallet';
  let action: () => void = () => st.connect();
  let disabled = false;
  if (st.wallet) {
    if (!st.canTrade) { label = 'Use the browser wallet (Lace) to create offers'; disabled = true; action = () => {}; }
    else if (!bothSel) { label = 'Select tokens'; disabled = true; action = () => {}; }
    else if (!sameKind) { label = 'Tokens must share privacy kind'; disabled = true; action = () => {}; }
    else if (payAmt.trim() !== '' && payBig === null) { label = 'Whole base units only'; disabled = true; action = () => {}; }
    else if (recvAmt.trim() !== '' && recvBig === null) { label = 'Whole base units only'; disabled = true; action = () => {}; }
    else if (payBig === null || payBig <= 0n) { label = 'Enter the amount you pay'; disabled = true; action = () => {}; }
    else if (recvBig === null || recvBig <= 0n) { label = 'Enter the amount you want'; disabled = true; action = () => {}; }
    else if (insufficientPay) { label = `Insufficient ${from!.name}`; disabled = true; action = () => {}; }
    else if (posting) { label = postStatus || 'Creating…'; disabled = true; action = () => {}; }
    else if (quote && !quote.sponsored) { label = 'Create offer file'; action = post; }
    else { label = bothShielded ? 'Create shielded order' : 'Create order'; action = post; }
  }

  // Everything the reference price lets us say: the rate itself, the maker's
  // offset from it, the sponsorship threshold, and where the price came from.
  // Pure and unit-tested in state/reference.test.ts.
  const ref = quote ? describeQuote(quote, from?.name ?? '', to?.name ?? '') : null;

  return (
    <>
      <div className="zs-card" style={{ marginTop: compact ? 0 : -22, position: 'relative', padding: 'var(--pad-card)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <FieldRow label="You pay" token={from} value={payAmt} onValue={setPayAmt} onPick={() => setPicking('from')} onClear={() => { setFrom(null); setQuote(null); }} balance={balanceFor(st, from)} usd={quote?.from_usd ?? null} compact={compact} />
        <div style={{ display: 'flex', justifyContent: 'center', margin: '-9px 0', position: 'relative', zIndex: 2 }}>
          <button className="zs-switch" onClick={doSwitch} title="Switch"><Icon.swap /></button>
        </div>
        <FieldRow label="You receive" token={to} value={recvAmt} onValue={(v) => { setAutoPrice(false); setRecvAmt(v); }} accent onPick={() => setPicking('to')} onClear={() => { setTo(null); setQuote(null); }} usd={quote?.to_usd ?? null} compact={compact} />

        {bothSel && sameKind && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 4px 2px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
              <span onClick={() => setAutoPrice((a) => !a)} style={{ width: 18, height: 18, borderRadius: 5, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: autoPrice ? 'var(--accent)' : 'var(--surface)', border: '1.5px solid ' + (autoPrice ? 'var(--accent)' : 'var(--line)') }}>
                {autoPrice && <svg viewBox="0 0 16 16" width="11" height="11" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              <span onClick={() => setAutoPrice((a) => !a)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Auto Market Price</span>
              {!compact && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{autoPrice ? '· balances at the best fillable price' : '· set your own price'}</span>}
            </label>

            {payBig !== null && payBig > 0n && recvBig !== null && recvBig > 0n && quote && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 14px', fontSize: 13 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}><Icon.shield style={{ color: 'var(--accent)', flex: '0 0 auto' }} /> Your rate · 1 {from!.name} = <RateInline value={quote.implied_rate ?? 0} /> {to!.name}</span>
                  {ref?.offset && <span className="zs-num" style={{ color: ref.offsetBelow ? 'var(--pos)' : 'var(--neg)', whiteSpace: 'nowrap', fontWeight: 600 }}>{ref.offset} vs reference</span>}
                </div>
                {/* The reference rate is shown in BOTH price modes now: in auto
                    mode the maker still has to see what the price is anchored to
                    and how far below it the sponsorship threshold sits. */}
                {ref?.referenceRate != null && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 12px', fontSize: 11.5, color: 'var(--ink-3)' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>Reference · 1 {from!.name} = <RateInline value={ref.referenceRate} /> {to!.name}</span>
                    {ref.thresholdText && <span style={{ whiteSpace: 'nowrap' }}>{ref.thresholdText}</span>}
                  </div>
                )}
                {ref?.sourceText && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>{ref.sourceText}</div>}

                {quote.sponsored ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 11, background: 'var(--pos-soft)', border: '1px solid color-mix(in srgb, var(--pos) 25%, transparent)' }}>
                    <Icon.shield style={{ color: 'var(--pos)', flex: '0 0 auto' }} />
                    <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}><b style={{ color: 'var(--pos)' }}>Celestia fee sponsored.</b> Good trades get filled fast.</span>
                  </div>
                ) : ref?.showNotSponsored ? (
                  // Suppressed for demo-priced pairs: the batcher sponsors
                  // unpriced tokens (BATCHER_SPONSOR_UNPRICED=allow), so
                  // warning about a test-token trade would be a lie.
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', borderRadius: 11, background: 'var(--warn-soft)', border: '1px solid color-mix(in srgb, var(--warn) 22%, transparent)' }}>
                    <span style={{ color: 'var(--warn)', fontWeight: 800, flex: '0 0 auto', lineHeight: 1.3 }}>!</span>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{ref.notSponsoredText ?? "This price won't be sponsored to Celestia."}
                      <button onClick={() => setAutoPrice(true)} style={{ marginLeft: 6, border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Apply best price</button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}

        <button className={'zs-btn zs-btn--block' + (!disabled ? ' zs-btn--primary' : '')} onClick={action} disabled={disabled}
          style={{ marginTop: 8, padding: compact ? 13 : undefined, fontSize: compact ? 15 : undefined, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer', background: disabled ? 'var(--surface-2)' : undefined, color: disabled ? 'var(--ink-3)' : undefined, boxShadow: disabled ? 'none' : undefined }}>
          {st.wallet && bothShielded && payBig !== null && payBig > 0n && recvBig !== null && recvBig > 0n && <Icon.shield />} {label}
        </button>

        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--neg)', lineHeight: 1.45, wordBreak: 'break-word', marginTop: 4 }}>{error}
            {errorCode === 'NOT_SPONSORED' && (
              <button onClick={() => { setAutoPrice(true); setError(null); setErrorCode(null); }} style={{ marginLeft: 6, border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Apply best price</button>
            )}
          </div>
        )}

        {bothSel && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: compact ? 8 : 12, fontSize: 12, color: 'var(--ink-3)' }}>
            {bothShielded
              ? <><Icon.shield style={{ color: 'var(--accent)' }} /> <span>Shielded — amounts hidden, settled privately via ZSwap</span></>
              : <><Icon.eye /> <span>Unshielded swap — amounts are visible on-chain</span></>}
          </div>
        )}
      </div>

      <TokenPicker open={picking === 'from'} onClose={() => setPicking(null)} tokens={st.knownTokens} shieldedBalances={st.shieldedBalances} unshieldedBalances={st.unshieldedBalances} excludeColor={to?.token_color} title="Pay with" onPick={(t) => { setFrom(t); setQuote(null); }} />
      <TokenPicker open={picking === 'to'} onClose={() => setPicking(null)} tokens={st.knownTokens} shieldedBalances={st.shieldedBalances} unshieldedBalances={st.unshieldedBalances} excludeColor={from?.token_color} title="Receive" onPick={(t) => { setTo(t); setQuote(null); }} />
    </>
  );
}

/** Standalone full-page Place Order screen (hero + form), kept for direct use. */
export function Swap({ st }: { st: ZSwapApp }) {
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <div style={{ background: 'var(--ink)', color: '#fff', padding: '26px 26px 38px', borderRadius: 'var(--r-card) var(--r-card) 0 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18, position: 'relative', zIndex: 1 }}>
          <Mark size={20} color="#fff" /><span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '.12em', opacity: 0.75, whiteSpace: 'nowrap' }}>ZERO-KNOWLEDGE SWAP</span>
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.02, position: 'relative', zIndex: 1 }}>Trade without a trace.</div>
        <div style={{ position: 'absolute', right: -36, top: -46, width: 200, height: 200, borderRadius: '50%', border: '30px solid var(--accent)', opacity: 0.5, filter: 'blur(1px)' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -70, width: 120, height: 120, borderRadius: '50%', border: '18px solid var(--accent)', opacity: 0.22 }} />
      </div>
      <PlaceOrderForm st={st} />
    </div>
  );
}
