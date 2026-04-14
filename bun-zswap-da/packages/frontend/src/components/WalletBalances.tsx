import React from 'react';
import { useWalletBalances } from '../hooks/useWalletBalances';
import { findTokenName, shortToken } from '../utils';
import type { KnownToken } from '../types';

interface WalletBalancesProps {
  activeWallet?: string;
  knownTokens: KnownToken[];
  balanceRefreshTrigger: number;
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
}) => {
  const { balances, loading, error } = useWalletBalances(activeWallet, balanceRefreshTrigger);

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
