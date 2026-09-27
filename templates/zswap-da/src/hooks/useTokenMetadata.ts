import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TOKEN_METADATA_CONFIG } from '../config';
import {
  displayTokenLabel,
  normalizeTokenColor,
  TokenMetadataStore,
  type TokenIdentity,
  type TokenPrivacy,
} from '../services/tokenMetadata';
import type { KnownToken } from '../types';
import { findTokenName } from '../utils';

const RECOVERY_TICK_MS = 30_000;
const MAX_ACTIVE_IDENTITIES = 256;

/**
 * One app-wide subscription to optional token labels. The caller supplies all
 * currently identifiable assets; retries refresh those active identities only.
 */
export function useTokenMetadata(identities: readonly TokenIdentity[], knownTokens: KnownToken[]) {
  const storeRef = useRef<TokenMetadataStore | null>(null);
  if (!storeRef.current) storeRef.current = new TokenMetadataStore(TOKEN_METADATA_CONFIG);
  const store = storeRef.current;
  const [version, setVersion] = useState(0);
  const [tracked, setTracked] = useState<TokenIdentity[]>([]);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => setVersion((value) => value + 1));
    return () => {
      unsubscribe();
      store.clear();
    };
  }, [store]);

  const active = useMemo(() => {
    const unique = new Map<string, TokenIdentity>();
    // Explicitly tracked (selected/visible) assets go first so the bounded
    // registry never excludes the token a person is actively using.
    for (const identity of [...tracked, ...identities]) {
      const color = normalizeTokenColor(identity.color);
      if (!color) continue;
      unique.set(`${identity.kind}:${color}`, { color, kind: identity.kind });
    }
    return [...unique.values()].slice(0, MAX_ACTIVE_IDENTITIES);
  }, [identities, tracked]);

  const activeKey = active.map((identity) => `${identity.kind}:${identity.color}`).sort().join('|');
  useEffect(() => {
    const refresh = () => {
      for (const identity of active) void store.request(identity.color, identity.kind);
    };
    refresh();
    const timer = setInterval(refresh, RECOVERY_TICK_MS);
    return () => clearInterval(timer);
    // `activeKey` is the stable identity set; callers commonly rebuild the array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, activeKey]);

  const labelFor = useCallback(
    (color: string, kind?: TokenPrivacy | null, fallback?: string | null): string => {
      const internal = fallback ?? findTokenName(color, knownTokens, kind ?? undefined);
      // Color-only historical APIs cannot distinguish two native kinds. Never
      // attach one kind's indexed name to their aggregate.
      const indexed = kind ? store.peek(color, kind) : null;
      return displayTokenLabel(indexed, internal, color);
    },
    [knownTokens, store, version],
  );

  const track = useCallback((colorValue: string, kind: TokenPrivacy) => {
    const color = normalizeTokenColor(colorValue);
    if (!color) return;
    setTracked((current) => {
      const key = `${kind}:${color}`;
      if (current.some((item) => `${item.kind}:${item.color}` === key)) return current;
      return [{ color, kind }, ...current].slice(0, MAX_ACTIVE_IDENTITIES);
    });
  }, []);

  return { labelFor, track };
}
