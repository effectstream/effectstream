// Parse an offer blob's asset imbalances from the TAKER's perspective, so the
// UI can preview "you pay / you receive" before importing+taking a shared offer.
// Mirrors the dispatch in browserContract.proveAndSubmitOffer: a maker's
// imbalance of +N for token T means the maker spent N (the taker RECEIVES N);
// −N means the maker output N (the taker PAYS N). Dust is the batcher's concern.

import { Transaction as LedgerV8Transaction } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { OfferFiles } from '@effectstream/mip-zswap-offer/mip5';

export interface ParsedLeg { color: string; kind: 'shielded' | 'unshielded'; amount: bigint }
export interface ParsedOffer { pays: ParsedLeg[]; gets: ParsedLeg[] }

export function parseTakerLegs(blob: string, networkId: NetworkId): ParsedOffer | null {
  let tx: any;
  try {
    setNetworkId(networkId);
    const bytes = OfferFiles.decode(blob);
    tx = LedgerV8Transaction.deserialize('signature', 'proof', 'binding', bytes);
  } catch {
    return null;
  }

  const intentIds: number[] = tx.intents ? (Array.from(tx.intents.keys()) as number[]) : [];
  const fallibleIds: number[] = tx.fallibleOffer ? (Array.from(tx.fallibleOffer.keys()) as number[]) : [];
  const candidates = Array.from(new Set<number>([0, ...intentIds, ...fallibleIds]));

  for (const segId of candidates) {
    let imb: Map<any, bigint>;
    try {
      imb = tx.imbalances(segId) as Map<any, bigint>;
    } catch {
      continue;
    }
    const pays: ParsedLeg[] = [];
    const gets: ParsedLeg[] = [];
    for (const [tt, delta] of imb) {
      const tag = (tt as any).tag as 'shielded' | 'unshielded' | 'dust';
      if (tag !== 'shielded' && tag !== 'unshielded') continue;
      const color = String((tt as any).raw);
      if (delta > 0n) gets.push({ color, kind: tag, amount: delta });
      else if (delta < 0n) pays.push({ color, kind: tag, amount: -delta });
    }
    if (pays.length || gets.length) return { pays, gets };
  }
  return null;
}
