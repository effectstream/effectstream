// Token chooser backed by the backend's known-tokens registry (real data).
// Privacy kind comes from the token record, not a name heuristic.

import { useMemo, useState } from 'react';
import { Modal, ModalHead } from './Modal';
import { Coin, Icon } from './icons';
import { shortToken } from '../utils';
import type { KnownToken } from '../types';

export function TokenPicker({
  open,
  onClose,
  tokens,
  onPick,
  excludeColor,
  title = 'Select a token',
}: {
  open: boolean;
  onClose: () => void;
  tokens: KnownToken[];
  onPick: (t: KnownToken) => void;
  excludeColor?: string | null;
  title?: string;
}) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tokens
      .filter((t) => t.token_color !== excludeColor)
      .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.token_color.includes(needle));
  }, [tokens, q, excludeColor]);

  return (
    <Modal open={open} onClose={onClose} width={420}>
      <ModalHead title={title} onClose={onClose} />
      <div style={{ padding: 16 }}>
        <div className="zs-field" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Icon.search style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or color"
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)' }} />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.length === 0 && <div style={{ padding: '18px 6px', fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' }}>No tokens{q ? ` match “${q}”` : ' registered yet — mint some on the Faucet'}.</div>}
          {rows.map((t) => (
            <button key={t.token_color} onClick={() => { onPick(t); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 10px', border: 'none', background: 'transparent', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <Coin sym={t.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div className="zs-num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{shortToken(t.token_color)}</div>
              </div>
              {t.kind === 'shielded'
                ? <span className="zs-badge-shield" style={{ padding: '4px 8px' }}><Icon.shield /> Shielded</span>
                : <span className="zs-pill" style={{ padding: '4px 8px' }}><Icon.eye /> Unshielded</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
