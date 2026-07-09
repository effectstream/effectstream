/**
 * Vendored from zswap-offerfile-kernel/packages/mip6-p2p-swaps (MIP-0006).
 * Types + deriveTokenLegs only — payload builders stay in the backend.
 */

export type TokenKind = 'SHIELDED' | 'UNSHIELDED';

export interface TokenLeg {
  token: string;
  amount: string;
  type: TokenKind;
}

export class UnknownTokenTagError extends Error {
  readonly tag: string;
  constructor(tag: string) {
    super(`Unknown token tag "${tag}"`);
    this.name = 'UnknownTokenTagError';
    this.tag = tag;
  }
}

function tagToKind(tag: string): TokenKind {
  if (tag === 'shielded') return 'SHIELDED';
  if (tag === 'unshielded') return 'UNSHIELDED';
  throw new UnknownTokenTagError(tag);
}

/** Derive tagged gives/wants from tx imbalances (dust ignored). */
export function deriveTokenLegs(tx: {
  intents?: { keys(): Iterable<number> };
  fallibleOffer?: { keys(): Iterable<number> };
  imbalances(segId: number): Iterable<[any, bigint]>;
}): { gives: TokenLeg[]; wants: TokenLeg[] } {
  const intentKeys = tx.intents ? Array.from(tx.intents.keys()) : [];
  const fallibleKeys = tx.fallibleOffer ? Array.from(tx.fallibleOffer.keys()) : [];
  const segmentIds = Array.from(new Set<number>([0, ...intentKeys, ...fallibleKeys]));

  const merged = new Map<string, { token: string; kind: TokenKind; delta: bigint }>();

  for (const segId of segmentIds) {
    for (const [tokenType, delta] of tx.imbalances(segId)) {
      const tt = tokenType as { tag: string; raw: string };
      if (tt.tag === 'dust') continue;
      if (tt.tag !== 'shielded' && tt.tag !== 'unshielded') {
        throw new UnknownTokenTagError(String(tt.tag));
      }
      const kind = tagToKind(tt.tag);
      const token = tt.raw.toLowerCase();
      const key = `${kind}:${token}`;
      const prev = merged.get(key);
      if (prev) prev.delta += delta;
      else merged.set(key, { token, kind, delta });
    }
  }

  const gives: TokenLeg[] = [];
  const wants: TokenLeg[] = [];
  for (const { token, kind, delta } of merged.values()) {
    if (delta > 0n) gives.push({ token, amount: delta.toString(), type: kind });
    else if (delta < 0n) wants.push({ token, amount: (-delta).toString(), type: kind });
  }
  return { gives, wants };
}
