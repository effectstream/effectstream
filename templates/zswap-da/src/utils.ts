import type { KnownToken } from './types';

export function shortToken(t?: string): string {
  if (!t) return '?';
  if (t.length <= 12) return t;
  return t.slice(0, 6) + '…' + t.slice(-4);
}

/** A canonical Midnight shielded address: `mn_shield-addr_<network>1…`. */
export function isShieldedAddress(addr: string): boolean {
  return addr.startsWith('mn_shield-addr');
}

/**
 * Head kept for a shielded address.
 *
 * A shielded address spends its first 15 characters on the constant
 * `mn_shield-addr_` tag, so the generic 10-character head below renders every
 * shielded identity as the same `mn_shield-...qhz8fj`: the network segment and
 * all but 6 characters of key material are invisible, and two wallets look
 * alike in the dropdown. 26 characters covers the whole human-readable part at
 * the longest network id we ship (`mn_shield-addr_undeployed1`); shorter ids
 * spend the remainder on key material (`mn_shield-addr_testnet1qrd`).
 *
 * 26 is a measured number, not a taste one — it is what fits on one line beside
 * the copy glyph in the 280px dropdown card. See the plan's Phase 6.
 */
const SHIELDED_HEAD = 26;

const HEAD = 10;
const TAIL = 6;

export function truncateAddress(addr: string): string {
  if (isShieldedAddress(addr)) {
    // A one-character ellipsis rather than the '...' below: it buys back two
    // characters of width, which at this length is the difference between
    // fitting on one line and wrapping onto two.
    return addr.length <= SHIELDED_HEAD + TAIL
      ? addr
      : addr.slice(0, SHIELDED_HEAD) + '…' + addr.slice(-TAIL);
  }
  if (addr.length <= HEAD + TAIL) return addr;
  return addr.slice(0, HEAD) + '...' + addr.slice(-TAIL);
}

export function findTokenName(token: string, knownTokens: KnownToken[]): string | undefined {
  return knownTokens.find(k => k.token_color === token)?.name;
}
