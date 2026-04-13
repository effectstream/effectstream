import React from 'react';
import type { AppEvent } from '../types';

interface EventFeedProps {
  events: AppEvent[];
  isConnected: boolean;
  onClear: () => void;
}

const EVENT_BADGES: Record<string, { label: string; className: string }> = {
  offer_indexed: { label: 'INDEXED', className: 'event-badge-indexed' },
  offer_consumed: { label: 'CONSUMED', className: 'event-badge-consumed' },
  offer_expired: { label: 'EXPIRED', className: 'event-badge-expired' },
  token_minted: { label: 'MINTED', className: 'event-badge-minted' },
};

function describeEvent(event: AppEvent): string {
  switch (event.type) {
    case 'offer_indexed':
      return `Offer #${event.offerId} indexed at Celestia block ${event.celestiaHeight}`;
    case 'offer_consumed':
      return `Offer #${event.offerId} consumed (nullifier: ${event.nullifier?.slice(0, 12)}...)`;
    case 'offer_expired':
      return `Offer #${event.offerId} expired (TTL)`;
    case 'token_minted':
      return `${event.wallet ?? '?'} minted token ${event.name ?? '?'}`;
    default:
      return event.type;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export const EventFeed: React.FC<EventFeedProps> = ({ events, isConnected, onClear }) => {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
          Live Event Feed
          <span className={`sse-status ${isConnected ? 'sse-status-connected' : 'sse-status-disconnected'}`}
                title={isConnected ? 'Connected' : 'Reconnecting...'} />
        </h2>
        <button
          onClick={onClear}
          style={{ margin: 0, padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
        >
          Clear
        </button>
      </div>

      <div className="event-feed">
        {events.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.85rem', padding: '12px' }}>
            No events yet. Submit an offer or run the demo to see live updates.
          </div>
        ) : (
          events.map((event, i) => {
            const badge = EVENT_BADGES[event.type];
            return (
              <div key={`${event.timestamp}-${i}`} className="event-item">
                <span className="event-time">{formatTime(event.timestamp)}</span>
                {badge && <span className={`event-badge ${badge.className}`}>{badge.label}</span>}
                <span className="event-desc">{describeEvent(event)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
