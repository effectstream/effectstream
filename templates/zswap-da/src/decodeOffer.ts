import { decodeOffer } from 'mip-zswap-offer';
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

// Cache the ledger module so repeated decodes don't re-resolve the import.
let ledgerModulePromise: Promise<typeof import('@midnight-ntwrk/ledger-v8')> | null = null;

export async function decodeOfferForDisplay(bech32: string): Promise<DecodeResult> {
  try {
    ledgerModulePromise ??= import('@midnight-ntwrk/ledger-v8');
    const { Transaction } = await ledgerModulePromise;

    const rawTx = decodeOffer(bech32);

    // Lace-made offers are <Sig, Proof, Binding>.
    let tx: any;
    try {
      tx = Transaction.deserialize('signature', 'proof', 'binding', rawTx);
    } catch (e: any) {
      return { ok: false, error: `Could not decode: ${e?.message ?? String(e)}` };
    }

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
    const merged = new Map<string, bigint>(); // token -> net delta (excluding dust)

    for (const { segId, label } of segments) {
      const entries: DecodedOffer['balance'][number]['entries'] = [];
      for (const [tokenType, delta] of tx.imbalances(segId) as Iterable<[any, bigint]>) {
        const tag: 'shielded' | 'unshielded' | 'dust' | 'unknown' =
          tokenType?.tag === 'shielded' || tokenType?.tag === 'unshielded' || tokenType?.tag === 'dust'
            ? tokenType.tag
            : 'unknown';
        const token = tag === 'dust' ? 'dust' : String(tokenType?.raw ?? '').toLowerCase();
        entries.push({ token, tag, delta: delta.toString() });
        if (tag !== 'dust' && tag !== 'unknown') {
          merged.set(token, (merged.get(token) ?? 0n) + delta);
        }
      }
      balance.push({ segId, label, entries });
    }

    const gives: TokenEntry[] = [];
    const wants: TokenEntry[] = [];
    for (const [token, delta] of merged) {
      if (delta > 0n) gives.push({ token, amount: delta.toString(), type: 'shielded' });
      else if (delta < 0n) wants.push({ token, amount: (-delta).toString(), type: 'shielded' });
    }

    return { ok: true, data: { intent: { gives, wants }, balance } };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
