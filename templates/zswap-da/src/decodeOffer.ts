import { OfferFiles } from '@effectstream/mip-zswap-offer/mip5';
import { P2pAtomicSwaps } from '@effectstream/mip-zswap-offer/mip6';
import type { UnprovenTransaction } from '@midnight-ntwrk/ledger-v8';
import type { TokenEntry } from './types';

export type DecodedOffer = {
  intent: { gives: TokenEntry[]; wants: TokenEntry[] };
  balance: Array<{
    segId: number;
    label: 'guaranteed' | 'fallible';
    entries: Array<{
      token: string; // hex, lowercased (or 'dust')
      tag: 'shielded' | 'unshielded' | 'dust' | 'unknown';
      delta: string; // stringified bigint, UI-ready
    }>;
  }>;
};

export type DecodeResult =
  | { ok: true; data: DecodedOffer }
  | { ok: false; error: string };

export async function decodeOfferForDisplay(bech32: string): Promise<DecodeResult> {
  try {
    // MIP-0005: swapoffer1… → Transaction; MIP-0006: tagged gives/wants.
    const tx = OfferFiles.fromBech32(bech32);
    // Proven offer tx; deriveTokenLegs only needs imbalances()/segment keys.
    const { gives, wants } = P2pAtomicSwaps.deriveTokenLegs(tx as UnprovenTransaction);

    // Segments: 0 = guaranteed, plus union of intents.keys() and
    // fallibleOffer.keys() (Lace's makeIntent may populate either).
    const intentKeys = [...(tx.intents?.keys() ?? [])] as number[];
    const fallibleKeys = [...(tx.fallibleOffer?.keys() ?? [])] as number[];
    const otherSegs = Array.from(new Set<number>([...intentKeys, ...fallibleKeys]));
    const segments: Array<{ segId: number; label: 'guaranteed' | 'fallible' }> = [
      { segId: 0, label: 'guaranteed' },
      ...otherSegs.map((k) => ({ segId: k, label: 'fallible' as const })),
    ];

    const balance: DecodedOffer['balance'] = [];
    for (const { segId, label } of segments) {
      const entries: DecodedOffer['balance'][number]['entries'] = [];
      for (const [tokenType, delta] of tx.imbalances(segId) as Iterable<[any, bigint]>) {
        const tag: 'shielded' | 'unshielded' | 'dust' | 'unknown' =
          tokenType?.tag === 'shielded' || tokenType?.tag === 'unshielded' || tokenType?.tag === 'dust'
            ? tokenType.tag
            : 'unknown';
        const token = tag === 'dust' ? 'dust' : String(tokenType?.raw ?? '').toLowerCase();
        entries.push({ token, tag, delta: delta.toString() });
      }
      balance.push({ segId, label, entries });
    }

    return { ok: true, data: { intent: { gives, wants }, balance } };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
