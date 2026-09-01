// icons.tsx — logo mark, token coins, and small UI glyphs.
// Ported from the design mock (lib/icons.jsx); exported instead of window globals.

type SvgProps = React.SVGProps<SVGSVGElement>;

// Ring + 3 stacked cubes, flattened from the 3D mark. Monochrome ink by default.
export function Mark({ size = 26, color = 'var(--ink)' }: { size?: number; color?: string }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="20.5" stroke={color} strokeWidth="3.2" />
      <g fill={color}>
        <rect x="19.2" y="9.4" width="9.6" height="9.6" rx="1.6" />
        <rect x="19.2" y="19.2" width="9.6" height="9.6" rx="1.6" />
        <rect x="19.2" y="29.0" width="9.6" height="9.6" rx="1.6" />
      </g>
    </svg>
  );
}

// Wordmark lockup. "midnight" eyebrow sits above the zswap wordmark.
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="zs-mark">
      <Mark size={size} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 2 }}>
        <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>midnight</span>
        <span className="zs-mark-word">z<b>swap</b></span>
      </span>
    </span>
  );
}

// Token registry. shielded:true => private, traded via ZSwaps (shield badge).
export interface TokenMeta {
  name: string;
  bg: string;
  fg: string;
  glyph: string;
  shielded: boolean;
  wrapped?: boolean;
}

export const TOKENS: Record<string, TokenMeta> = {
  NIGHT: { name: 'Night', bg: '#0A0A0A', fg: '#fff', glyph: '◓', shielded: false },
  USDM: { name: 'Midnight USD', bg: '#0000FE', fg: '#fff', glyph: '$', shielded: true },
  USDC: { name: 'USD Coin', bg: '#2775CA', fg: '#fff', glyph: '$', shielded: false },
  USDA: { name: 'USD Anchor', bg: '#1AAE9F', fg: '#fff', glyph: '$', shielded: false },
  wBTC: { name: 'Wrapped BTC', bg: '#F7931A', fg: '#fff', glyph: '₿', wrapped: true, shielded: false },
  wETH: { name: 'Wrapped ETH', bg: '#5B6BEE', fg: '#fff', glyph: 'Ξ', wrapped: true, shielded: false },
  wSOL: { name: 'Wrapped SOL', bg: 'linear-gradient(135deg,#9945FF,#19FB9B)', fg: '#fff', glyph: '◎', wrapped: true, shielded: false },
  wsBTC: { name: 'Wrapped-Shielded BTC', bg: '#F7931A', fg: '#fff', glyph: '₿', wrapped: true, shielded: true },
  wsETH: { name: 'Wrapped-Shielded ETH', bg: '#5B6BEE', fg: '#fff', glyph: 'Ξ', wrapped: true, shielded: true },
  wsSOL: { name: 'Wrapped-Shielded SOL', bg: 'linear-gradient(135deg,#9945FF,#19FB9B)', fg: '#fff', glyph: '◎', wrapped: true, shielded: true },
};

export function isShielded(sym: string): boolean {
  return !!(TOKENS[sym] && TOKENS[sym].shielded);
}

// ---- deterministic coin colors -------------------------------------------
// A token's identifier is split in half: the FIRST half seeds the background
// hue, the SECOND half seeds the glyph (font) hue. Lightness is constrained to
// guaranteed-safe ranges so every hue pairing reads with strong contrast: the
// background is darkened until its luminance is low enough that the always-light
// pastel glyph contrasts clearly against it.
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
function relLuminance([r, g, b]: [number, number, number]): number {
  const c = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
export function coinColors(seed: string): { bg: string; fg: string } {
  const s = seed && seed.length ? seed : '?';
  const mid = Math.max(1, Math.ceil(s.length / 2));
  const hBg = hashStr(s.slice(0, mid)) % 360;
  const hFg = hashStr(s.slice(mid) || s) % 360;
  // pick the lightest background lightness whose luminance is still dark enough
  let bgL = 16;
  for (const L of [46, 40, 34, 28, 22, 16]) {
    if (relLuminance(hslToRgb(hBg, 62, L)) <= 0.085) { bgL = L; break; }
  }
  return { bg: `hsl(${hBg}, 62%, ${bgL}%)`, fg: `hsl(${hFg}, 85%, 90%)` };
}

export function Coin({ sym, size, address }: { sym: string; size?: 'lg' | 'sm'; address?: string }) {
  const meta = TOKENS[sym];
  const t = meta ?? { ...coinColors(sym), glyph: (sym?.[0] || '?').toUpperCase(), shielded: false };
  const cls =
    'zs-coin' +
    (size === 'lg' ? ' zs-coin--lg' : size === 'sm' ? ' zs-coin--sm' : '') +
    ((t as TokenMeta).shielded ? ' zs-coin--shielded' : '');
  const tooltip = address ?? sym;
  return (
    <span className={cls + ' zs-coin--tip'} style={{ background: t.bg }} data-tip={tooltip}>
      <span style={{ color: t.fg, transform: 'translateY(-0.5px)' }}>{t.glyph}</span>
    </span>
  );
}

// Small inline icons.
export const Icon = {
  caret: (p: SvgProps) => (<svg className="zs-caret" viewBox="0 0 16 16" fill="none" {...p}><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  swap: (p: SvgProps) => (<svg viewBox="0 0 20 20" fill="none" width="17" height="17" {...p}><path d="M6 3v11M6 14l-3-3M6 14l3-3M14 17V6M14 6l-3 3M14 6l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  shield: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="13" height="13" {...p}><path d="M8 1.6l5 1.8v3.4c0 3.1-2.1 5.2-5 6.2-2.9-1-5-3.1-5-6.2V3.4L8 1.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M5.8 8.1l1.5 1.5 3-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  bolt: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13" {...p}><path d="M9 1.5L3.5 9H7l-1 5.5L12.5 7H9l1-5.5z" /></svg>),
  arrow: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="14" height="14" {...p}><path d="M3 8h9M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  clock: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="13" height="13" {...p}><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.6V8l2.4 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  search: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="15" height="15" {...p}><circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" /><path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>),
  spark: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13" {...p}><path d="M8 1l1.4 4.2L13.6 6 9.4 7.4 8 11.6 6.6 7.4 2.4 6 6.6 5.2z" /></svg>),
  eye: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="13" height="13" {...p}><path d="M1.4 8S3.8 3.6 8 3.6 14.6 8 14.6 8 12.2 12.4 8 12.4 1.4 8 1.4 8z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.3" /></svg>),
  filter: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="13" height="13" {...p}><path d="M2 4h12M4.5 8h7M6.5 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>),
  drop: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="13" height="13" {...p}><path d="M8 1.6C8 1.6 3.5 6.4 3.5 9.6a4.5 4.5 0 109 0C12.5 6.4 8 1.6 8 1.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>),
  wallet: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="13" height="13" {...p}><rect x="1.8" y="3.6" width="12.4" height="9" rx="2.2" stroke="currentColor" strokeWidth="1.4" /><path d="M10.6 8.2h1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M2 5.4h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>),
  ext: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="12" height="12" {...p}><path d="M6 3h7v7M13 3l-7.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  dot: (p: SvgProps) => (<svg viewBox="0 0 8 8" width="8" height="8" {...p}><circle cx="4" cy="4" r="3" fill="currentColor" /></svg>),
  copy: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="12" height="12" {...p}><rect x="5.6" y="5.6" width="8.2" height="8.2" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M10.4 3.6a2 2 0 00-2-1.4H4.2a2 2 0 00-2 2v4.2a2 2 0 001.4 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>),
  check: (p: SvgProps) => (<svg viewBox="0 0 16 16" fill="none" width="12" height="12" {...p}><path d="M3 8.4l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>),
};

// Inline tag marking a token's privacy mode.
export function ShieldTag({ sym, mini }: { sym: string; mini?: boolean }) {
  const sh = isShielded(sym);
  if (mini)
    return (
      <span className={sh ? 'zs-badge-shield' : 'zs-pill'} style={{ padding: sh ? '3px 7px 3px 6px' : '3px 8px', fontSize: 10.5, gap: 4 }}>
        {sh ? (<><Icon.shield /> Shielded</>) : (<><Icon.eye /> Unshielded</>)}
      </span>
    );
  return sh ? (
    <span className="zs-badge-shield"><Icon.shield /> Shielded</span>
  ) : (
    <span className="zs-pill"><Icon.eye /> Unshielded</span>
  );
}
