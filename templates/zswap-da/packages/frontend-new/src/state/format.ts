// Display formatters, ported from the mock's data.jsx. Pure + reusable.
// Symbol-keyed `dp` is kept for the mock token symbols; real (color-keyed)
// balances use `fmtBalance`.

export function dp(sym?: string): number {
  if (!sym) return 2;
  if (sym === 'wBTC' || sym === 'wsBTC') return 5;
  if (/^(w|ws)(ETH|SOL)$/.test(sym)) return 3;
  return 2;
}

export function fmt(n: number | null | undefined, d?: number): string {
  if (n == null || isNaN(n)) return '0';
  if (d == null) d = n >= 1000 ? 2 : 4;
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtAmt(n: number, sym?: string): string {
  return fmt(n, dp(sym));
}

export function fmtUsd(n: number): string {
  return '$' + fmt(n, 2);
}

// Rate display: prefer plain decimals; use scientific (3 × 10⁻⁵) only when it's
// shorter than the plain form. Ported from the mock's data.jsx.
export type RateDisplay = { kind: 'plain'; text: string } | { kind: 'sci'; mant: string; exp: number };
export function rateDisplay(v: number): RateDisplay {
  if (!v || isNaN(v)) return { kind: 'plain', text: '0' };
  let plain: string;
  if (v >= 1) plain = v.toLocaleString('en-US', { maximumFractionDigits: v > 100 ? 2 : 4 });
  else plain = parseFloat(v.toPrecision(3)).toString();
  const exp = Math.floor(Math.log10(v));
  const mant = +(v / Math.pow(10, exp)).toPrecision(3);
  const mantStr = String(mant);
  const sciLen = mantStr.length + 4 + String(Math.abs(exp)).length;
  if (plain.length <= sciLen) return { kind: 'plain', text: plain };
  return { kind: 'sci', mant: mantStr, exp };
}

/** Format a balance amount that arrives as a string (real wallet balances are
 *  string-encoded). Falls back to the raw string if it isn't numeric. */
export function fmtBalance(amount: string | number | null | undefined): string {
  if (amount == null) return '0';
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(/,/g, ''));
  if (!isFinite(n)) return String(amount);
  return fmt(n, n >= 1000 ? 2 : n === Math.floor(n) ? 0 : 4);
}
