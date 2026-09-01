// Connected wallet dropdown: shielded identity, real address + balances,
// disconnect. Adapted from app/ZSwap.html WalletMenu — wired to live wallet data.
import { useEffect, useRef, useState } from 'react';
import { WalletPill, type WalletInfo } from './WalletPill';
import { Icon } from './icons';
import { truncateAddress } from '../utils';
import { fmtBalance } from '../state/format';
import { formatShieldedAddress } from '../state/shieldedAddress';
import { TokenChip } from './TokenChip';
import type { KnownToken } from '../types';

const NETWORK_ID = (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as string) || 'undeployed';

/** How long the "Copied" confirmation stays up. */
const COPIED_MS = 1500;

interface WalletMenuState {
  wallet: WalletInfo | null;
  shieldedAddress: string | null;
  shieldedEncryptionPublicKey: string | null;
  unshieldedAddress: string | null;
  shieldedBalances: Record<string, string> | null;
  unshieldedBalances: Record<string, string> | null;
  knownTokens?: KnownToken[];
  disconnect: () => void;
  refreshBalances?: () => void;
  refreshing?: boolean;
}

function BalRows({ title, balances, knownTokens }: { title: string; balances: Record<string, string> | null; knownTokens: KnownToken[] }) {
  const entries = Object.entries(balances ?? {}).filter(([, v]) => Number(v) > 0);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="zs-tag" style={{ marginBottom: 6 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>none</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(([color, amt]) => (
            <div key={color} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <TokenChip color={color} knownTokens={knownTokens} size="sm" />
              <span className="zs-num" style={{ fontWeight: 600, fontSize: 13 }}>{fmtBalance(amt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WalletMenu({ st }: { st: WalletMenuState }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const off = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, []);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // The local JS wallet reports the shielded identity as a raw hex coin public
  // key; Lace reports the canonical bech32m address. Normalize for display only
  // — st.shieldedAddress itself is what the faucet and offer builders consume.
  // The unshielded fallback (shown when there is no shielded address yet) is
  // already bech32m and passes straight through.
  const addr = st.shieldedAddress
    ? formatShieldedAddress(st.shieldedAddress, st.shieldedEncryptionPublicKey, NETWORK_ID)
    : (st.unshieldedAddress ?? '');

  const copyAddress = async () => {
    if (!addr) return;
    // Absent on non-secure origins; rejects if the user denies permission.
    // Either way stay silent rather than flash a "Copied" that did not happen.
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) return;
    try {
      await clipboard.writeText(addr);
    } catch {
      return;
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

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
          {/* Clicking copies the FULL address. The dropdown stays open: the
              only thing that closes it is a pointerdown outside `ref`, and this
              button lives inside it. */}
          <button
            type="button"
            onClick={copyAddress}
            disabled={!addr}
            title={addr ? 'Copy address' : undefined}
            aria-label={addr ? `Copy address ${addr}` : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
              width: '100%', padding: 0, border: 0, background: 'none',
              font: 'inherit', textAlign: 'left', color: 'inherit',
              cursor: addr ? 'pointer' : 'default',
            }}
          >
            <Icon.shield style={{ color: 'var(--accent)', flex: '0 0 auto' }} />
            <span className="zs-num" style={{ fontSize: 12.5, fontWeight: 600, wordBreak: 'break-all', color: 'var(--ink-2)' }}>{truncateAddress(addr)}</span>
            {addr && (
              <span
                aria-live="polite"
                style={{
                  marginLeft: 'auto', flex: '0 0 auto', display: 'inline-flex',
                  alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600,
                  color: copied ? 'var(--accent)' : 'var(--ink-3)',
                }}
              >
                {copied ? <><Icon.check /> Copied</> : <Icon.copy />}
              </span>
            )}
          </button>
          <BalRows title="Shielded" balances={st.shieldedBalances} knownTokens={st.knownTokens ?? []} />
          <BalRows title="Unshielded" balances={st.unshieldedBalances} knownTokens={st.knownTokens ?? []} />
          <button className="zs-btn zs-btn--block" style={{ padding: 11, fontSize: 14 }} onClick={() => { setOpen(false); st.disconnect(); }}>Disconnect</button>
        </div>
      )}
    </div>
  );
}
