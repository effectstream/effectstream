import React, { useEffect, useMemo, useState } from 'react';
import { useZSwapAPI } from '../hooks/useZSwapAPI';
import type { KnownToken, TokenEntry } from '../types';
import { shortToken } from '../utils';
import { OfferDetailModal } from './OfferDetailModal';
import { FILTER_DIRECTION, DEFAULT_PAGE_SIZE } from '../constants';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { AliceBobName } from '../hooks/useAliceBobIdentity';
import { isOwnOffer, parseOfferSender } from '../services/offerSender';

interface ZSwapListProps {
  knownTokens: KnownToken[];
  refreshTrigger: number;
  sseRefreshTrigger?: number;
  connectedApi?: ConnectedAPI | null;
  selfName: AliceBobName;
  otherName: AliceBobName;
  // Lower-cased hex of the connected wallet's unshielded UserAddress.
  // Undefined when no wallet is connected.
  selfUnshieldedHex?: string;
  networkId: string | null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderTokens(arr: TokenEntry[] | undefined, knownTokens: KnownToken[]) {
  if (!arr?.length) return '—';
  return arr.map((t, idx) => {
    if (!t.token) return <span key={idx}>? × {t.amount ?? '?'}</span>;
    const known = knownTokens.find(k => k.token_color === t.token);
    if (known) {
      return <span key={idx}><span className="badge badge-token" title={t.token}>{known.name}</span> × {t.amount ?? '?'}</span>;
    }
    return <span key={idx}>{shortToken(t.token)} × {t.amount ?? '?'}</span>;
  }).reduce((prev, curr) => [prev, ', ', curr] as any);
}

export const ZSwapList: React.FC<ZSwapListProps> = ({ knownTokens, refreshTrigger, sseRefreshTrigger = 0, connectedApi, selfName, otherName, selfUnshieldedHex, networkId }) => {
  const {
    offers, loading, error,
    limit, setLimit, offset, setOffset,
    setFilterToken, setFilterSide,
    fetchOffers, nextPage, prevPage, resetFilters,
  } = useZSwapAPI();

  const [showFilters, setShowFilters] = useState(false);
  const [tempFilterTokenSelect, setTempFilterTokenSelect] = useState('');
  const [tempFilterTokenCustom, setTempFilterTokenCustom] = useState('');
  const [tempFilterSide, setTempFilterSide] = useState<string>(FILTER_DIRECTION.ANY);
  const [tempLimit, setTempLimit] = useState(DEFAULT_PAGE_SIZE);
  const [detailOffer, setDetailOffer] = useState<typeof offers[0] | null>(null);

  useEffect(() => { fetchOffers(); }, [fetchOffers, refreshTrigger, sseRefreshTrigger]);

  // Per-offer Alice/Bob label, derived from the unshielded UserAddress(es)
  // baked into the offer's Intent. Undefined when the offer is shielded-only
  // and we can't tell — the UI falls back to a neutral dash.
  const offerLabels = useMemo<Record<number, AliceBobName | undefined>>(() => {
    if (!networkId) return {};
    const map: Record<number, AliceBobName | undefined> = {};
    for (const o of offers) {
      if (!o.transaction_hex) continue;
      const info = parseOfferSender(o.transaction_hex, networkId as NetworkId);
      if (!info) continue;
      map[o.id] = isOwnOffer(info, selfUnshieldedHex) ? selfName : otherName;
    }
    return map;
  }, [offers, networkId, selfUnshieldedHex, selfName, otherName]);

  const handleApplyFilters = () => {
    const token = tempFilterTokenSelect === 'custom' ? tempFilterTokenCustom : tempFilterTokenSelect;
    setFilterToken(token);
    setFilterSide(tempFilterSide);
    setLimit(tempLimit);
    setOffset(0);
  };

  const handleResetFilters = () => {
    setTempFilterTokenSelect('');
    setTempFilterTokenCustom('');
    setTempFilterSide(FILTER_DIRECTION.ANY);
    setTempLimit(DEFAULT_PAGE_SIZE);
    resetFilters();
  };

  return (
    <section>
      <OfferDetailModal
        offer={detailOffer}
        knownTokens={knownTokens}
        connectedApi={connectedApi}
        onClose={() => setDetailOffer(null)}
        onCompleted={fetchOffers}
      />

      <div className="section-header">
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
          ZSwap Offers <span className="text-muted" style={{ fontWeight: 'normal' }}>({offers.length})</span>
        </h2>
        <div className="flex-row">
          <button onClick={fetchOffers} className="btn-ghost btn-small">↻ Refresh</button>
          <button className="btn-small" style={{ margin: 0 }} onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? 'Hide Filters' : 'Filter'}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filter-bar">
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label>Filter by token</label>
            <div className="flex-row" style={{ alignItems: 'center' }}>
              <select
                style={{ flex: '0 0 180px' }}
                value={tempFilterTokenSelect}
                onChange={(e) => setTempFilterTokenSelect(e.target.value)}
              >
                <option value="">Any token</option>
                {knownTokens.map(t => (
                  <option key={t.token_color} value={t.token_color}>{t.name}</option>
                ))}
                <option value="custom">Custom token...</option>
              </select>
              {tempFilterTokenSelect === 'custom' && (
                <input
                  type="text"
                  placeholder="Token hex address..."
                  style={{ flex: 1 }}
                  value={tempFilterTokenCustom}
                  onChange={(e) => setTempFilterTokenCustom(e.target.value)}
                />
              )}
            </div>
          </div>
          <div style={{ width: '140px' }}>
            <label>Side</label>
            <select value={tempFilterSide} onChange={(e) => setTempFilterSide(e.target.value)}>
              <option value={FILTER_DIRECTION.ANY}>Any</option>
              <option value={FILTER_DIRECTION.GIVING}>Giving</option>
              <option value={FILTER_DIRECTION.WANTING}>Wanting</option>
            </select>
          </div>
          <div style={{ width: '140px' }}>
            <label>Per page</label>
            <select value={tempLimit} onChange={(e) => setTempLimit(Number(e.target.value))}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <div className="flex-row">
            <button className="btn-small" style={{ marginTop: 0 }} onClick={handleApplyFilters}>Apply</button>
            <button className="btn-small btn-secondary" style={{ marginTop: 0 }} onClick={handleResetFilters}>Clear</button>
          </div>
        </div>
      )}

      <div className="pagination-bar">
        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
          {offers.length > 0 ? `Showing ${offset + 1}–${offset + offers.length}` : ''}
        </span>
        <div className="flex-row-sm">
          <button className="btn-small btn-secondary" onClick={prevPage} disabled={offset <= 0}>Prev</button>
          <button className="btn-small btn-secondary" onClick={nextPage} disabled={offers.length < limit}>Next</button>
        </div>
      </div>

      <div className="table-responsive">
        {error && <div className="error">{error}</div>}
        {loading && !offers.length ? (
          <span className="text-muted">Loading...</span>
        ) : !offers.length ? (
          <span className="text-muted">No ZSwap offers indexed yet. Submit one above and wait for the node to pick it up from Celestia.</span>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>By</th>
                <th>Giving</th>
                <th>Wanting</th>
                <th style={{ width: '1%' }}></th>
              </tr>
            </thead>
            <tbody>
              {offers.map(z => {
                const label = offerLabels[z.id];
                return (
                  <tr key={z.id}>
                    <td>#{z.id}</td>
                    <td>
                      {label ? (
                        <span
                          className={`badge ${label === selfName ? 'badge-token' : 'badge-da'}`}
                          title={label === selfName ? 'Submitted by your wallet' : 'Submitted by another wallet'}
                        >
                          {capitalize(label)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{renderTokens(z.gives, knownTokens)}</td>
                    <td>{renderTokens(z.wants, knownTokens)}</td>
                    <td>
                      <button
                        className="btn-small btn-ghost"
                        style={{ padding: '4px 8px', lineHeight: 1 }}
                        onClick={() => setDetailOffer(z)}
                        title="View details"
                      >
                        &#128065;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};
