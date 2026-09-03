// Token chooser. The list is the backend known-tokens registry MERGED with any
// token colors the connected wallet actually holds (so you can trade a token the
// indexer hasn't registered a name for). A manual-entry panel also lets you pick
// an arbitrary token by typing its color/ID and privacy kind.

import { useEffect, useMemo, useState } from 'react';
import { Modal, ModalHead } from './Modal';
import { Coin, Icon } from './icons';
import { shortToken } from '../utils';
import { DEFAULT_DECIMALS, formatAmount } from '../state/amount';
import type { KnownToken } from '../types';

const HEX_RE = /^[0-9a-fA-F]+$/;

export function TokenPicker({
  open,
  onClose,
  tokens,
  onPick,
  excludeColor,
  title = 'Select a token',
  shieldedBalances,
  unshieldedBalances,
}: {
  open: boolean;
  onClose: () => void;
  tokens: KnownToken[];
  onPick: (t: KnownToken) => void;
  excludeColor?: string | null;
  title?: string;
  shieldedBalances?: Record<string, string> | null;
  unshieldedBalances?: Record<string, string> | null;
}) {
  const [q, setQ] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualKind, setManualKind] = useState<'shielded' | 'unshielded'>('shielded');

  // Reset transient state each time the picker is dismissed.
  useEffect(() => {
    if (!open) { setQ(''); setManualOpen(false); setManualId(''); setManualKind('shielded'); }
  }, [open]);

  const balanceOf = (color: string): string | null =>
    shieldedBalances?.[color] ?? unshieldedBalances?.[color] ?? null;

  // Known tokens ∪ wallet-held colors (wallet-only colors get a short-id name).
  const merged = useMemo<KnownToken[]>(() => {
    const byColor = new Map<string, KnownToken>();
    for (const t of tokens) byColor.set(t.token_color, t);
    const addWallet = (map: Record<string, string> | null | undefined, kind: 'shielded' | 'unshielded') => {
      for (const color of Object.keys(map ?? {})) {
        // Wallet-only colour: nothing in the registry says how to read it, so
        // it takes the default precision like every other unregistered token.
        if (!byColor.has(color)) {
          byColor.set(color, { token_color: color, name: shortToken(color), kind, decimals: DEFAULT_DECIMALS });
        }
      }
    };
    addWallet(shieldedBalances, 'shielded');
    addWallet(unshieldedBalances, 'unshielded');
    // Tokens you actually hold float to the top.
    return [...byColor.values()].sort((a, b) =>
      (balanceOf(a.token_color) != null ? 0 : 1) - (balanceOf(b.token_color) != null ? 0 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, shieldedBalances, unshieldedBalances]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return merged
      .filter((t) => t.token_color !== excludeColor)
      .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.token_color.toLowerCase().includes(needle));
  }, [merged, q, excludeColor]);

  const manualNorm = manualId.trim().toLowerCase();
  const manualValid = manualNorm.length > 0 && HEX_RE.test(manualNorm);
  const useManual = () => {
    if (!manualValid) return;
    // If the id already matches a known/held token, reuse its real record.
    const existing = merged.find((t) => t.token_color === manualNorm);
    onPick(existing ?? { token_color: manualNorm, name: shortToken(manualNorm), kind: manualKind, decimals: DEFAULT_DECIMALS });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} width={420}>
      <ModalHead title={title} onClose={onClose} />
      <div style={{ padding: 16 }}>
        <div className="zs-field" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Icon.search style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or color"
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)' }} />
        </div>

        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.length === 0 && <div style={{ padding: '18px 6px', fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' }}>No tokens{q ? ` match “${q}”` : ' registered yet — mint some on the Faucet'}.</div>}
          {rows.map((t) => {
            const bal = balanceOf(t.token_color);
            return (
              <button key={t.token_color} onClick={() => { onPick(t); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 10px', border: 'none', background: 'transparent', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <Coin sym={t.name} address={t.token_color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div className="zs-num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{shortToken(t.token_color)}</div>
                </div>
                {bal != null && <span className="zs-num" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', flex: '0 0 auto' }}>{formatAmount(bal, t.decimals)}</span>}
                {t.kind === 'shielded'
                  ? <span className="zs-badge-shield" style={{ padding: '4px 8px', flex: '0 0 auto' }}><Icon.shield /> Shielded</span>
                  : <span className="zs-pill" style={{ padding: '4px 8px', flex: '0 0 auto' }}><Icon.eye /> Unshielded</span>}
              </button>
            );
          })}
        </div>

        {/* manual token-id entry */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
          {!manualOpen ? (
            <button className="zs-btn" style={{ width: '100%', justifyContent: 'center', fontSize: 13.5, padding: '11px 14px' }}
              onClick={() => { setManualOpen(true); if (HEX_RE.test(q.trim())) setManualId(q.trim()); }}>
              <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 700 }}>+</span> Enter a token ID manually
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="zs-field-label">Token ID (color)</span>
              <input autoFocus value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="0000000000000000000000000000000000000000000000000000000000000001"
                className="zs-num" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 'var(--r-field)', padding: '11px 13px', fontSize: 12.5, color: 'var(--ink)', outline: 'none', wordBreak: 'break-all' }} />
              <div className="zs-seg" style={{ background: 'var(--bg-tint)', alignSelf: 'flex-start' }}>
                {(['shielded', 'unshielded'] as const).map((k) => (
                  <button key={k} aria-selected={manualKind === k} onClick={() => setManualKind(k)}
                    style={manualKind === k ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 3px rgba(10,12,20,.08)' } : { background: 'transparent', color: 'var(--ink-2)' }}>
                    {k === 'shielded' ? <><Icon.shield /> Shielded</> : <><Icon.eye /> Unshielded</>}
                  </button>
                ))}
              </div>
              {manualNorm && !manualValid && <div style={{ fontSize: 12, color: 'var(--neg)' }}>Token ID must be a hex string (0-9, a-f).</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="zs-btn" style={{ flex: '0 0 auto', padding: '10px 14px', fontSize: 13.5 }} onClick={() => setManualOpen(false)}>Cancel</button>
                <button className="zs-btn zs-btn--primary" style={{ flex: 1, justifyContent: 'center', padding: 10, fontSize: 13.5, opacity: manualValid ? 1 : 0.5, cursor: manualValid ? 'pointer' : 'default' }} disabled={!manualValid} onClick={useManual}>Use this token</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
