import React from 'react';
import type { KnownToken } from '../types';
import type { DecodedOffer } from '../decodeOffer';
import { shortToken } from '../utils';

function tokenLabel(token: string, knownTokens: KnownToken[]): React.ReactNode {
  if (token === 'dust') return <span className="badge badge-token" title="dust">DUST</span>;
  const known = knownTokens.find(k => k.token_color === token);
  if (known) return <span className="badge badge-token" title={token}>{known.name}</span>;
  return <span title={token}>{shortToken(token)}</span>;
}

export const OfferDecodedView: React.FC<{
  decoded: DecodedOffer;
  knownTokens: KnownToken[];
}> = ({ decoded, knownTokens }) => (
  <div className="offer-decoded-view">
    <div className="offer-decoded-section">
      <div className="offer-decoded-heading">Intent</div>
      <table className="kv-table">
        <tbody>
          <tr>
            <td className="kv-label">Gives</td>
            <td className="kv-value-dark">
              {decoded.intent.gives.length === 0 ? '—' :
                decoded.intent.gives.map((g, i) => (
                  <span key={i}>{i > 0 ? ', ' : ''}{tokenLabel(g.token, knownTokens)} × {g.amount}</span>
                ))}
            </td>
          </tr>
          <tr>
            <td className="kv-label">Wants</td>
            <td className="kv-value-dark">
              {decoded.intent.wants.length === 0 ? '—' :
                decoded.intent.wants.map((w, i) => (
                  <span key={i}>{i > 0 ? ', ' : ''}{tokenLabel(w.token, knownTokens)} × {w.amount}</span>
                ))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className="offer-decoded-section">
      <div className="offer-decoded-heading">Balance</div>
      {decoded.balance.map(seg => (
        <div key={seg.segId} className="offer-decoded-segment">
          <div className="offer-decoded-segment-label">
            Segment {seg.segId} <span className="kv-label-muted">({seg.label})</span>
          </div>
          {seg.entries.length === 0 ? (
            <div className="kv-label-muted offer-decoded-empty">(no imbalances)</div>
          ) : (
            <table className="kv-table">
              <tbody>
                {seg.entries.map((e, i) => (
                  <tr key={i}>
                    <td className="kv-label">{tokenLabel(e.token, knownTokens)}</td>
                    <td className="kv-value-dark">
                      {e.delta}{e.tag === 'dust' ? ' (fee)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  </div>
);
