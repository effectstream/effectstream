import React from 'react';
import { useWalletBalances } from '../hooks/useWalletBalances';
import { findTokenName, shortToken } from '../utils';
import type { KnownToken } from '../types';
import { BROWSER_WALLET_ID } from '../hooks/useActiveWallet';

interface WalletBalancesProps {
  activeWallet?: string;
  knownTokens: KnownToken[];
  balanceRefreshTrigger: number;
  browserBalances?: Record<string, string> | null;
}

function BalanceList({
  entries,
  knownTokens,
}: {
  entries: Record<string, string>;
  knownTokens: KnownToken[];
}) {
  const items = Object.entries(entries);
  if (items.length === 0) {
    return <div className="text-muted" style={{ fontSize: '0.8rem', padding: '8px 12px' }}>None</div>;
  }
  return (
    <div className="balance-list">
      {items.map(([tokenColor, amount]) => {
        const name = findTokenName(tokenColor, knownTokens);
        return (
          <div key={tokenColor} className="balance-row">
            <span className="badge badge-token" title={tokenColor}>
              {name ?? shortToken(tokenColor)}
            </span>
            <span className="balance-amount">{amount}</span>
          </div>
        );
      })}
    </div>
  );
}

export const WalletBalances: React.FC<WalletBalancesProps> = ({
  activeWallet,
  knownTokens,
  balanceRefreshTrigger,
  browserBalances,
}) => {
  const isBrowser = activeWallet === BROWSER_WALLET_ID;
  // Skip backend fetch for the browser wallet — it has no backend presence.
  const { balances: backendBalances, loading, error } = useWalletBalances(
    isBrowser ? undefined : activeWallet,
    balanceRefreshTrigger,
  );

  const balances = isBrowser
    ? { shielded: browserBalances ?? {}, unshielded: {} as Record<string, string> }
    : backendBalances;

  return (
    <section>
      <h2 style={{ marginBottom: '12px' }}>
        Wallet Balances{' '}
        <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 400 }}>
          ({activeWallet ?? '—'})
        </span>
      </h2>

      {loading && !balances && (
        <div className="text-muted" style={{ fontSize: '0.85rem' }}>Loading balances...</div>
      )}

      {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}

      {balances && (
        <>
          <div className="balance-section-label">Shielded</div>
          <BalanceList entries={balances.shielded} knownTokens={knownTokens} />

          <div className="balance-section-label">Unshielded</div>
          <BalanceList entries={balances.unshielded} knownTokens={knownTokens} />
        </>
      )}
    </section>
  );
};
