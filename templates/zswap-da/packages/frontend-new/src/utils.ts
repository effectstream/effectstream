import type { KnownToken } from './types';

export function shortToken(t?: string): string {
  if (!t) return '?';
  if (t.length <= 12) return t;
  return t.slice(0, 6) + '…' + t.slice(-4);
}

export function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.slice(0, 10) + '...' + addr.slice(-6);
}

export function findTokenName(token: string, knownTokens: KnownToken[]): string | undefined {
  return knownTokens.find(k => k.token_color === token)?.name;
}
