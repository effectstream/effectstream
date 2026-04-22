import React, { useEffect, useState } from 'react';
import type { KnownToken, TokenEntry, ZSwapOffer } from '../types';
import { api } from '../services/api';
import { shortToken } from '../utils';
import { decodeOfferForDisplay, type DecodeResult } from '../decodeOffer';
import { decodeOffer } from 'mip-zswap-offer';
import { Modal } from './ui/Modal';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ResultTable } from './ui/ResultTable';
import { OfferDecodedView } from './OfferDecodedView';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

interface OfferDetailModalProps {
  offer: ZSwapOffer | null;
  knownTokens: KnownToken[];
  activeWallet?: string;
  connectedApi?: ConnectedAPI | null;
  onClose: () => void;
  onCompleted: () => void;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

export const OfferDetailModal: React.FC<OfferDetailModalProps> = ({ offer, knownTokens, activeWallet, connectedApi, onClose, onCompleted }) => {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completeResult, setCompleteResult] = useState<{ data?: any; message: string; error?: boolean } | null>(null);
  const [showDecoded, setShowDecoded] = useState(false);
  const [decoded, setDecoded] = useState<DecodeResult | null>(null);
  const [decoding, setDecoding] = useState(false);

  // Reset decode state whenever the modal switches to a different offer.
  useEffect(() => {
    setShowDecoded(false);
    setDecoded(null);
    setDecoding(false);
  }, [offer?.id]);

  const toggleDecoded = async () => {
    const next = !showDecoded;
    setShowDecoded(next);
    if (next && decoded === null && offer?.transaction_hex) {
      setDecoding(true);
      const bech32 = offer.transaction_hex;
      const result = await decodeOfferForDisplay(bech32);
      // Guard against stale async if the user switched offers mid-decode.
      setDecoded((prev) => (prev === null ? result : prev));
      setDecoding(false);
    }
  };

  const handleComplete = async (id: number) => {
    setCompletingId(id);
    setCompleteResult(null);
    try {
      if (connectedApi && offer?.transaction_hex) {
        // Browser-wallet path: decode the maker's bech32m offer, ask the
        // wallet to balance+seal it, then submit to Midnight via the wallet.
        // Celestia indexing of consumption is handled server-side through
        // nullifier observation — no backend call required.
        const rawBytes = decodeOffer(offer.transaction_hex);
        const hex = bytesToHex(rawBytes);
        const { tx: balanced } = await connectedApi.balanceSealedTransaction(hex, { payFees: true });
        await connectedApi.submitTransaction(balanced);
        setCompleteResult({ data: { via: 'browser-wallet' }, message: 'Offer completed via browser wallet!' });
      } else {
        const data = await api.completeOffer(id, activeWallet);
        setCompleteResult({ data, message: 'Offer completed successfully!' });
      }
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
                <td className="kv-value-dark">
                  <div className="transaction-cell-header">
                    <span className="kv-label-muted">{showDecoded ? 'Decoded' : 'Raw'}</span>
                    <button
                      type="button"
                      className="btn-small btn-ghost"
                      onClick={toggleDecoded}
                      disabled={!offer.transaction_hex || decoding}
                      title={showDecoded ? 'Show raw bech32m' : 'Show decoded offer'}
                      aria-label={showDecoded ? 'Show raw bech32m' : 'Show decoded offer'}
                    >
                      {String.fromCodePoint(0x1f441)}
                    </button>
                  </div>
                  {showDecoded ? (
                    decoding ? (
                      <div className="kv-label-muted">Decoding…</div>
                    ) : decoded?.ok === false ? (
                      <div style={{ color: '#dc2626' }}>Could not decode: {decoded.error}</div>
                    ) : decoded?.ok === true ? (
                      <OfferDecodedView decoded={decoded.data} knownTokens={knownTokens} />
                    ) : null
                  ) : (
                    <div style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>
                      {offer.transaction_hex || '—'}
                    </div>
                  )}
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
