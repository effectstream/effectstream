// Connected wallet dropdown: shielded identity, real address + balances,
// disconnect. Adapted from app/ZSwap.html WalletMenu — wired to live wallet data.
import { useEffect, useRef, useState } from 'react';
import { WalletPill, type WalletInfo } from './WalletPill';
import { Icon } from './icons';
import { shortToken, truncateAddress } from '../utils';
import { fmtBalance } from '../state/format';

interface WalletMenuState {
  wallet: WalletInfo | null;
  shieldedAddress: string | null;
  unshieldedAddress: string | null;
  shieldedBalances: Record<string, string> | null;
  unshieldedBalances: Record<string, string> | null;
  disconnect: () => void;
  refreshBalances?: () => void;
  refreshing?: boolean;
}

function BalRows({ title, balances }: { title: string; balances: Record<string, string> | null }) {
  const entries = Object.entries(balances ?? {}).filter(([, v]) => Number(v) > 0);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="zs-tag" style={{ marginBottom: 6 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>none</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(([color, amt]) => (
            <div key={color} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, gap: 12 }}>
              <span className="zs-num" style={{ color: 'var(--ink-3)' }}>{shortToken(color)}</span>
              <span className="zs-num" style={{ fontWeight: 600 }}>{fmtBalance(amt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WalletMenu({ st }: { st: WalletMenuState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, []);
  const addr = st.shieldedAddress ?? st.unshieldedAddress ?? '';
  if (!st.wallet) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <WalletPill wallet={st.wallet} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="zs-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280, padding: 14, zIndex: 50, boxShadow: 'var(--sh-pop)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="zs-tag">Shielded identity</div>
            {st.refreshBalances && (
              <button className="zs-btn zs-btn--ghost" style={{ padding: '2px 8px', fontSize: 11 }} disabled={st.refreshing} onClick={() => st.refreshBalances!()}>{st.refreshing ? '…' : 'Refresh'}</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Icon.shield style={{ color: 'var(--accent)', flex: '0 0 auto' }} />
            <span className="zs-num" style={{ fontSize: 12.5, fontWeight: 600, wordBreak: 'break-all', color: 'var(--ink-2)' }}>{truncateAddress(addr)}</span>
          </div>
          <BalRows title="Shielded" balances={st.shieldedBalances} />
          <BalRows title="Unshielded" balances={st.unshieldedBalances} />
          <button className="zs-btn zs-btn--block" style={{ padding: 11, fontSize: 14 }} onClick={() => { setOpen(false); st.disconnect(); }}>Disconnect</button>
        </div>
      )}
    </div>
  );
}
