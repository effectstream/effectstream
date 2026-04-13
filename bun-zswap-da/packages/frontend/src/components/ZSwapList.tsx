import React, { useEffect, useState } from 'react';
import { useZSwapAPI } from '../hooks/useZSwapAPI';
import type { KnownToken, TokenEntry } from '../types';
import { api } from '../services/api';
import { Logo3D } from './Logo3D';

interface ZSwapListProps {
  knownTokens: KnownToken[];
  refreshTrigger: number;
  sseRefreshTrigger?: number;
  activeWallet?: string;
}

export const ZSwapList: React.FC<ZSwapListProps> = ({ knownTokens, refreshTrigger, sseRefreshTrigger = 0, activeWallet }) => {
  const {
    offers,
    loading,
    error,
    limit, setLimit,
    offset, setOffset,
    setFilterToken,
    setFilterSide,
    fetchOffers,
    nextPage,
    prevPage,
    resetFilters
  } = useZSwapAPI();

  const [showFilters, setShowFilters] = useState(false);
  const [tempFilterTokenSelect, setTempFilterTokenSelect] = useState("");
  const [tempFilterTokenCustom, setTempFilterTokenCustom] = useState("");
  const [tempFilterSide, setTempFilterSide] = useState("any");
  const [tempLimit, setTempLimit] = useState(100);

  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeResult, setCompleteResult] = useState<{ data?: any, message: string, error?: boolean } | null>(null);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers, refreshTrigger, sseRefreshTrigger]);

  const handleApplyFilters = () => {
    const token = tempFilterTokenSelect === 'custom' ? tempFilterTokenCustom : tempFilterTokenSelect;
    setFilterToken(token);
    setFilterSide(tempFilterSide);
    setLimit(tempLimit);
    setOffset(0);
  };

  const handleResetFilters = () => {
    setTempFilterTokenSelect("");
    setTempFilterTokenCustom("");
    setTempFilterSide("any");
    setTempLimit(100);
    resetFilters();
  };

  const handleComplete = async (id: number) => {
    setCompletingId(id);
    setCompleteResult(null);
    setCompleteModalOpen(true);
    try {
      const data = await api.completeOffer(id, activeWallet);
      setCompleteResult({ data, message: 'Offer completed successfully!' });
      fetchOffers();
    } catch (e: any) {
      setCompleteResult({ message: e.message || 'Complete failed', error: true });
    } finally {
      setCompletingId(null);
    }
  };

  const handleCloseCompleteModal = () => {
    setCompleteModalOpen(false);
    setCompleteResult(null);
  };

  const renderTokens = (arr?: TokenEntry[]) => {
    if (!arr?.length) return '—';
    return arr.map((t, idx) => {
      if (!t.token) return `? × ${t.amount ?? '?'}`;
      const known = knownTokens.find(k => k.token_color === t.token);
      if (known) {
        return <span key={idx}><span className="badge badge-token" title={t.token}>{known.name}</span> × {t.amount ?? '?'}</span>;
      }
      return <span key={idx}>{shortToken(t.token)} × {t.amount ?? '?'}</span>;
    }).reduce((prev, curr) => [prev, ', ', curr] as any);
  };

  const shortToken = (t?: string) => {
    if (!t) return '?';
    if (t.length <= 12) return t;
    return t.slice(0, 6) + '…' + t.slice(-4);
  };

  return (
    <section>
      {completeModalOpen && (
        <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget && !completingId) handleCloseCompleteModal(); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Complete Offer {completingId !== null ? `#${completingId}` : ''}</h2>
              {!completingId && <button className="modal-close" onClick={handleCloseCompleteModal}>&times;</button>}
            </div>

            {completingId !== null ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 24px' }}>
                <Logo3D size={140} rotationSpeed={0.025} interactive={false} />
                <p style={{ marginTop: '24px', marginBottom: '4px', color: '#e2e8f0', fontSize: '0.95rem', textAlign: 'center' }}>
                  Submitting completion to Midnight…
                </p>
                <p style={{ marginTop: 0, color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
                  This may take a moment...
                </p>
              </div>
            ) : completeResult && (
              <div style={{ padding: '8px 0' }}>
                <p style={{ color: completeResult.error ? '#dc2626' : '#22c55e', fontWeight: 600, marginBottom: '16px' }}>
                  {completeResult.message}
                </p>
                {completeResult.data && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', fontFamily: 'ui-monospace, monospace' }}>
                    <tbody>
                      {Object.entries(completeResult.data).map(([key, value]) => (
                        <tr key={key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 8px', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{key}</td>
                          <td style={{ padding: '6px 8px', color: '#e2e8f0', wordBreak: 'break-all' }}>
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <button onClick={handleCloseCompleteModal} style={{ width: '100%', marginTop: '20px' }}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
          ZSwap Offers <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>({offers.length})</span>
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={fetchOffers} 
            style={{ margin: 0, padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
          >
            ↻ Refresh
          </button>
          <button 
            className="btn-small" 
            style={{ margin: 0 }} 
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Filter'}
          </button>
        </div>
      </div>

      {showFilters && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label>Filter by token</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
              <option value="any">Any</option>
              <option value="GIVING">Giving</option>
              <option value="WANTING">Wanting</option>
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-small" style={{ marginTop: 0 }} onClick={handleApplyFilters}>Apply</button>
            <button className="btn-small" style={{ marginTop: 0, background: '#e5e7eb', color: '#374151' }} onClick={handleResetFilters}>Clear</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          {offers.length > 0 ? `Showing ${offset + 1}–${offset + offers.length}` : ''}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            className="btn-small" 
            style={{ margin: 0, background: '#e5e7eb', color: '#374151' }} 
            onClick={prevPage} 
            disabled={offset <= 0}
          >
            Prev
          </button>
          <button 
            className="btn-small" 
            style={{ margin: 0, background: '#e5e7eb', color: '#374151' }} 
            onClick={nextPage} 
            disabled={offers.length < limit}
          >
            Next
          </button>
        </div>
      </div>

      <div className="table-responsive">
        {error && <div className="error">{error}</div>}
        {loading && !offers.length ? (
          <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading...</span>
        ) : !offers.length ? (
          <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No ZSwap offers indexed yet. Submit one above and wait for the node to pick it up from Celestia.</span>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Giving</th>
                <th>Wanting</th>
                <th>Celestia Height</th>
                <th>Transaction</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {offers.map(z => (
                <tr key={z.id}>
                  <td>#{z.id}</td>
                  <td>{renderTokens(z.gives)}</td>
                  <td>{renderTokens(z.wants)}</td>
                  <td>{z.celestia_height ?? '—'}</td>
                  <td title={z.transaction_hex}>{z.transaction_hex ? shortToken(z.transaction_hex) : '—'}</td>
                  <td>
                    <button
                      className="btn-small"
                      style={{ margin: 0 }}
                      onClick={() => handleComplete(z.id)}
                      disabled={completingId !== null}
                    >
                      Complete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};
