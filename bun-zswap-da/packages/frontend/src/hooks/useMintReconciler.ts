// Reconciles pending browser-wallet mint names against the connected wallet's
// balances. Whenever an unknown token color appears in the wallet that isn't
// registered in the backend's known_tokens table, this pops the oldest queued
// name and registers it.
//
// Runs whenever:
// - the refresh trigger changes (SSE bumps it on token_minted / faucet_sent)
// - `knownTokens` changes (so freshly registered names clear the queue)
// - a new entry is enqueued (via the mintQueue subscription)

import { useEffect, useRef } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { KnownToken } from '../types';
import { api } from '../services/api';
import { listPending, peekOldest, removeMintName, subscribe } from '../services/mintQueue';

const NIGHT_TOKEN_ID = '0'.repeat(64);

export function useMintReconciler(
  connectedApi: ConnectedAPI | null,
  knownTokens: KnownToken[],
  refreshTrigger: number,
  onReconciled: () => void,
) {
  const running = useRef(false);
  const queueVersion = useRef(0);

  useEffect(() => {
    const unsub = subscribe(() => {
      queueVersion.current += 1;
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!connectedApi) return;
    if (listPending().length === 0) return;

    let cancelled = false;

    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const [shielded, unshielded] = await Promise.all([
          connectedApi.getShieldedBalances(),
          connectedApi.getUnshieldedBalances(),
        ]);
        if (cancelled) return;

        const knownSet = new Set(knownTokens.map((t) => t.token_color.toLowerCase()));
        const allColors = new Set<string>();
        for (const c of Object.keys(shielded)) allColors.add(c.toLowerCase());
        for (const c of Object.keys(unshielded)) allColors.add(c.toLowerCase());
        allColors.delete(NIGHT_TOKEN_ID);

        const unknown = Array.from(allColors).filter((c) => !knownSet.has(c));
        if (unknown.length === 0) return;

        let progressed = false;
        for (const color of unknown) {
          const next = peekOldest();
          if (!next) break;
          console.log('[mintReconciler] registering', { color, name: next.name });
          try {
            await api.registerKnownToken(color, next.name);
            removeMintName(next.id);
            progressed = true;
          } catch (e: any) {
            // Common case: another tab already registered this color, or the
            // name collides. Drop the queue head either way — we can't make
            // progress on it and don't want to block the rest.
            console.warn('[mintReconciler] register failed, dropping queue entry', {
              color,
              name: next.name,
              err: e?.message ?? String(e),
            });
            removeMintName(next.id);
          }
        }
        if (progressed) onReconciled();
      } catch (e: any) {
        console.warn('[mintReconciler] balance read failed', e?.message ?? e);
      } finally {
        running.current = false;
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedApi, knownTokens, refreshTrigger, queueVersion.current]);
}
