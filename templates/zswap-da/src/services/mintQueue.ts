// Pending-name queue for browser-wallet mints.
//
// The browser wallet submits mint transactions directly to Midnight. The
// minted token name (an off-chain UX label) is not part of the on-chain state
// and must be registered in the backend's `known_tokens` table separately.
// If the register call fails — or the page reloads before it runs — the token
// would show up in the wallet as an opaque hex color with no human name.
//
// This module keeps a small FIFO queue of names the user has requested but
// that haven't yet been reconciled with a minted color. A reconciler watches
// the browser wallet's balances and, whenever an unknown color appears,
// registers it with the oldest queued name. The queue is persisted to
// localStorage so it survives reloads.

import { DEFAULT_DECIMALS } from '../state/amount';

const STORAGE_KEY = 'zswap-da:pending-mint-names';

export interface PendingMintName {
  id: string;        // unique — used to remove entries once consumed
  name: string;
  enqueuedAt: number;
  /** Precision the mint was made at, so the reconciler's retry registers the
   *  same value the immediate call would have. Optional: entries persisted by a
   *  build before project 00024 have none and fall back to DEFAULT_DECIMALS. */
  decimals?: number;
}

function read(): PendingMintName[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PendingMintName =>
        !!e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.enqueuedAt === 'number',
    );
  } catch {
    return [];
  }
}

function write(entries: PendingMintName[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* no-op: quota exceeded / privacy mode */
  }
  for (const cb of subscribers) cb();
}

const subscribers = new Set<() => void>();

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function listPending(): PendingMintName[] {
  return read();
}

export function enqueueMintName(name: string, decimals: number = DEFAULT_DECIMALS): PendingMintName {
  const entry: PendingMintName = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    enqueuedAt: Date.now(),
    decimals,
  };
  const next = [...read(), entry];
  write(next);
  console.log('[mintQueue] enqueue', entry);
  return entry;
}

export function removeMintName(id: string): void {
  const next = read().filter((e) => e.id !== id);
  write(next);
  console.log('[mintQueue] remove', id);
}

export function peekOldest(): PendingMintName | null {
  const entries = read();
  return entries.length > 0 ? entries[0] : null;
}

export function clearQueue(): void {
  write([]);
}
