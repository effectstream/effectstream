// Local record of offers THIS browser created — so the order book can hide them
// (you can't take your own offer). Shielded offers are anonymous on-chain, so
// the only reliable "mine" signal for them is what we created locally. Keyed by
// the offer blob (transaction_hex). Populated by the swap-create step.

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

export function addMyOffer(blob: string): void {
  const s = get();
  s.add(blob);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch { /* ignore quota */ }
}

export function isMyOffer(blob: string | undefined): boolean {
  return !!blob && get().has(blob);
}
