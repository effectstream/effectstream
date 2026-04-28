import React from 'react';
import { findTokenName, shortToken } from '../utils';
import type { KnownToken } from '../types';

interface WalletBalancesProps {
  knownTokens: KnownToken[];
  balanceRefreshTrigger: number;
  browserBalances?: Record<string, string> | null;
  browserUnshieldedBalances?: Record<string, string> | null;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
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
  knownTokens,
  balanceRefreshTrigger,
  browserBalances,
  browserUnshieldedBalances,
  onRefresh,
  refreshing,
}) => {
  // `balanceRefreshTrigger` is here so callers can trigger a re-render when
  // upstream events (mint, swap consumption) suggest the wallet's view is
  // stale. The actual fetch happens inside useWallet → connectedApi.
  void balanceRefreshTrigger;

  const hasWallet = browserBalances !== null && browserBalances !== undefined;

  return (
    <section>
      <h2 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Wallet Balances</span>
        {onRefresh && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => { void onRefresh(); }}
            disabled={!hasWallet || !!refreshing}
            title="Re-fetch balances from the wallet"
            style={{ marginLeft: 'auto' }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </h2>

      {!hasWallet ? (
        <div className="text-muted" style={{ fontSize: '0.85rem' }}>
          Connect a browser wallet (Lace) to see your balances.
        </div>
      ) : (
        <>
          <div className="balance-section-label">Shielded</div>
          <BalanceList entries={browserBalances ?? {}} knownTokens={knownTokens} />

          <div className="balance-section-label">Unshielded</div>
          <BalanceList entries={browserUnshieldedBalances ?? {}} knownTokens={knownTokens} />
        </>
      )}
    </section>
  );
};
