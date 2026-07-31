// Local record of offers THIS browser created — so the order book can mark them
// (you can't take your own offer). Shielded offers are anonymous on-chain, so
// the only reliable "mine" signal for them is what we created locally.
//
// Keyed by `offerId` (hex sha256 of the raw MIP-0005 transaction bytes),
// which is what the blob-free order book now carries. Entries written by older
// builds were keyed by the full bech32m blob; those are kept and still match, so
// trades made before this migration don't lose their "mine" marking.

const KEY = 'zswap-da:my-offers';

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

let cache: Set<string> | null = null;
function get(): Set<string> {
  if (!cache) cache = load();
  return cache;
}

function persist(s: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch { /* ignore quota */ }
}

/**
 * Record an offer this browser created. Pass the `offerId` returned by
 * `POST /v1/offers`; the blob is also accepted so legacy callers and
 * pre-migration records keep working.
 */
export function addMyOffer(key: string | null | undefined): void {
  if (!key) return;
  const s = get();
  s.add(key);
  persist(s);
}

/** True when this offer hash (or legacy blob) was created by this browser. */
export function isMyOffer(key: string | null | undefined): boolean {
  return !!key && get().has(key);
}
