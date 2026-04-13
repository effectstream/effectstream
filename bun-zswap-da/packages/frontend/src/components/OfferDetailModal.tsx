import React, { useState } from 'react';
import type { KnownToken, TokenEntry, ZSwapOffer } from '../types';
import { api } from '../services/api';
import { shortToken } from '../utils';
import { Modal } from './ui/Modal';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ResultTable } from './ui/ResultTable';

interface OfferDetailModalProps {
  offer: ZSwapOffer | null;
  knownTokens: KnownToken[];
  activeWallet?: string;
  onClose: () => void;
  onCompleted: () => void;
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

export const OfferDetailModal: React.FC<OfferDetailModalProps> = ({ offer, knownTokens, activeWallet, onClose, onCompleted }) => {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completeResult, setCompleteResult] = useState<{ data?: any; message: string; error?: boolean } | null>(null);

  const handleComplete = async (id: number) => {
    setCompletingId(id);
    setCompleteResult(null);
    try {
      const data = await api.completeOffer(id, activeWallet);
      setCompleteResult({ data, message: 'Offer completed successfully!' });
      onCompleted();
    } catch (e: any) {
      setCompleteResult({ message: e.message || 'Complete failed', error: true });
    } finally {
      setCompletingId(null);
    }
  };

  const handleClose = () => {
    if (!completingId) {
      setCompleteResult(null);
      onClose();
    }
  };

  const isOpen = offer !== null || completeResult !== null;
  const title = completeResult ? 'Complete Offer' : `Offer Detail${offer ? ` #${offer.id}` : ''}`;

  return (
    <Modal title={title} isOpen={isOpen} onClose={handleClose} closable={!completingId}>
      {completingId !== null ? (
        <LoadingOverlay message="Submitting completion to Midnight…" />
      ) : completeResult ? (
        <div style={{ padding: '8px 0' }}>
          <p style={{ color: completeResult.error ? '#dc2626' : '#22c55e', fontWeight: 600, marginBottom: '16px' }}>
            {completeResult.message}
          </p>
          {completeResult.data && <ResultTable data={completeResult.data} />}
          <button onClick={handleClose} style={{ width: '100%', marginTop: '20px' }}>
            Close
          </button>
        </div>
      ) : offer && (
        <div style={{ padding: '8px 0' }}>
          <table className="kv-table kv-table-detail">
            <tbody>
              <tr><td className="kv-label">ID</td><td className="kv-value-dark">#{offer.id}</td></tr>
              <tr><td className="kv-label">Giving</td><td className="kv-value-dark">{renderTokens(offer.gives, knownTokens)}</td></tr>
              <tr><td className="kv-label">Wanting</td><td className="kv-value-dark">{renderTokens(offer.wants, knownTokens)}</td></tr>
              <tr><td className="kv-label">Celestia Height</td><td className="kv-value-dark">{offer.celestia_height ?? '—'}</td></tr>
              <tr>
                <td className="kv-label">Transaction</td>
                <td className="kv-value-dark" style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>
                  {offer.transaction_hex || '—'}
                </td>
              </tr>
            </tbody>
          </table>
          <button
            className="btn-success"
            style={{ width: '100%', marginTop: '20px' }}
            onClick={() => handleComplete(offer.id)}
            disabled={completingId !== null}
          >
            Complete Offer
          </button>
        </div>
      )}
    </Modal>
  );
};
