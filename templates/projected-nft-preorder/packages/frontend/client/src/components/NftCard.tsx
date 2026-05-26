import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";

// ── Seeded PRNG (splitmix32) ────────────────────────────────────────────────
function splitmix32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x9e3779b9) | 0;
    let t = seed ^ (seed >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}

function hexToSeed(hex: string): number {
  let h = 0;
  for (let i = 0; i < hex.length; i++) {
    h = (Math.imul(31, h) + hex.charCodeAt(i)) | 0;
  }
  return h;
}

// ── Card generation from seed ───────────────────────────────────────────────
const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

const PATTERNS = [
  "radial",
  "diamonds",
  "stripes",
  "chevrons",
  "circles",
  "crosshatch",
] as const;

interface CardTraits {
  suit: string;
  rank: string;
  hue: number;
  saturation: number;
  pattern: (typeof PATTERNS)[number];
  patternScale: number;
  glowIntensity: number;
  borderRadius: number;
}

function generateTraits(hex: string): CardTraits {
  const rng = splitmix32(hexToSeed(hex));
  return {
    suit: SUITS[Math.floor(rng() * SUITS.length)],
    rank: RANKS[Math.floor(rng() * RANKS.length)],
    hue: Math.floor(rng() * 360),
    saturation: 30 + Math.floor(rng() * 50),
    pattern: PATTERNS[Math.floor(rng() * PATTERNS.length)],
    patternScale: 0.6 + rng() * 0.8,
    glowIntensity: 0.5 + rng() * 0.5,
    borderRadius: 10 + Math.floor(rng() * 6),
  };
}

// ── SVG pattern generators ──────────────────────────────────────────────────
function patternSvg(kind: string, scale: number, color: string): string {
  const s = Math.round(20 * scale);
  const half = Math.round(s / 2);
  let inner = "";
  switch (kind) {
    case "diamonds":
      inner = `<polygon points="${half},2 ${s - 2},${half} ${half},${s - 2} 2,${half}" fill="none" stroke="${color}" stroke-width="0.8"/>`;
      break;
    case "stripes":
      inner = `<line x1="0" y1="0" x2="${s}" y2="${s}" stroke="${color}" stroke-width="0.8"/>`;
      break;
    case "chevrons":
      inner = `<polyline points="0,${half} ${half},${Math.round(half * 0.4)} ${s},${half}" fill="none" stroke="${color}" stroke-width="0.8"/>`;
      break;
    case "circles":
      inner = `<circle cx="${half}" cy="${half}" r="${Math.round(half * 0.6)}" fill="none" stroke="${color}" stroke-width="0.8"/>`;
      break;
    case "crosshatch":
      inner = `<line x1="0" y1="0" x2="${s}" y2="${s}" stroke="${color}" stroke-width="0.5"/><line x1="${s}" y1="0" x2="0" y2="${s}" stroke="${color}" stroke-width="0.5"/>`;
      break;
    default:
      return "";
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'>${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ── Noise texture (tiny data-uri) ───────────────────────────────────────────
const NOISE_URI = (() => {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 18;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
})();

// ── Tweakable constants ─────────────────────────────────────────────────────
const CARD_WIDTH = 180;
const CARD_HEIGHT = 252;
const MAX_TILT = 18;          // degrees
const PERSPECTIVE = 800;       // px
const GLOW_RADIUS = 140;      // px – specular highlight size
const GLOW_OPACITY = 0.45;    // base specular opacity
const IRIDESCENT_OPACITY = 0.35;
const BORDER_GLOW_BLUR = 12;  // px
const BORDER_GLOW_SPREAD = 2; // px
const TRANSITION_MS = 120;    // spring-back speed
const SHINE_SIZE = 60;        // % – rainbow gradient coverage

// ── Component ───────────────────────────────────────────────────────────────
interface Props {
  assetHex: string;
  name: string;
  children?: React.ReactNode;
}

export default function NftCard({ assetHex, name, children }: Props) {
  const traits = useMemo(() => generateTraits(assetHex), [assetHex]);
  const ref = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5, active: false });

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMouse({
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      active: true,
    });
  }, []);

  const onLeave = useCallback(() => {
    setMouse({ x: 0.5, y: 0.5, active: false });
  }, []);

  // Derived values
  const tiltX = (mouse.y - 0.5) * -MAX_TILT;
  const tiltY = (mouse.x - 0.5) * MAX_TILT;
  const specX = mouse.x * 100;
  const specY = mouse.y * 100;

  const hsl = (l: number, a = 1) =>
    `hsla(${traits.hue}, ${traits.saturation}%, ${l}%, ${a})`;

  const bgPattern =
    traits.pattern === "radial"
      ? `radial-gradient(circle at 50% 40%, ${hsl(18)} 0%, ${hsl(8)} 100%)`
      : `${patternSvg(traits.pattern, traits.patternScale, hsl(22, 0.35))}, linear-gradient(160deg, ${hsl(14)} 0%, ${hsl(7)} 100%)`;

  // Iridescent rainbow gradient that follows the mouse
  const iridescentGrad = `linear-gradient(
    ${130 + (mouse.x - 0.5) * 60}deg,
    hsla(${traits.hue}, 80%, 70%, 0) ${50 - SHINE_SIZE / 2}%,
    hsla(${traits.hue + 40}, 90%, 65%, ${IRIDESCENT_OPACITY}) ${48}%,
    hsla(${traits.hue + 100}, 85%, 60%, ${IRIDESCENT_OPACITY * 0.8}) 50%,
    hsla(${traits.hue + 180}, 90%, 65%, ${IRIDESCENT_OPACITY}) ${52}%,
    hsla(${traits.hue + 240}, 80%, 70%, 0) ${50 + SHINE_SIZE / 2}%
  )`;

  // Specular highlight
  const specGrad = `radial-gradient(
    circle ${GLOW_RADIUS}px at ${specX}% ${specY}%,
    hsla(${traits.hue + 60}, 70%, 92%, ${mouse.active ? GLOW_OPACITY * traits.glowIntensity : 0}) 0%,
    transparent 100%
  )`;

  const shadowColor = hsl(50, mouse.active ? 0.6 * traits.glowIntensity : 0.15);
  const borderColor = mouse.active
    ? `hsla(${traits.hue}, ${traits.saturation + 20}%, 50%, 0.6)`
    : `hsla(${traits.hue}, ${traits.saturation}%, 25%, 0.4)`;

  return (
    <div style={{ perspective: PERSPECTIVE, width: CARD_WIDTH }}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: traits.borderRadius,
          border: `1px solid ${borderColor}`,
          position: "relative",
          overflow: "hidden",
          cursor: "default",
          transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${mouse.active ? 1.04 : 1})`,
          transition: mouse.active
            ? `transform ${TRANSITION_MS}ms ease-out`
            : `transform 400ms ease`,
          boxShadow: mouse.active
            ? `0 0 ${BORDER_GLOW_BLUR}px ${BORDER_GLOW_SPREAD}px ${shadowColor}, 0 8px 32px rgba(0,0,0,0.5)`
            : `0 2px 8px rgba(0,0,0,0.4)`,
          willChange: "transform",
        }}
      >
        {/* Base background + pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: bgPattern,
            borderRadius: traits.borderRadius,
          }}
        />

        {/* Noise texture overlay */}
        {NOISE_URI && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${NOISE_URI})`,
              backgroundRepeat: "repeat",
              opacity: 0.5,
              mixBlendMode: "overlay",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Iridescent sheen */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: iridescentGrad,
            mixBlendMode: "color-dodge",
            pointerEvents: "none",
            transition: `background ${TRANSITION_MS}ms ease-out`,
          }}
        />

        {/* Specular highlight */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: specGrad,
            mixBlendMode: "overlay",
            pointerEvents: "none",
            transition: mouse.active ? "none" : `background 400ms ease`,
          }}
        />

        {/* Card face content */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "10px 12px",
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        >
          {/* Top-left rank + suit */}
          <div style={{ lineHeight: 1 }}>
            <div
              style={{
                fontSize: "1.2rem",
                fontWeight: 800,
                color: hsl(85, 0.9),
                textShadow: `0 0 8px ${hsl(60, 0.4)}`,
                fontFamily: "'Georgia', serif",
              }}
            >
              {traits.rank}
            </div>
            <div
              style={{
                fontSize: "1rem",
                color: hsl(75, 0.7),
                marginTop: -2,
              }}
            >
              {traits.suit}
            </div>
          </div>

          {/* Center suit – large */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: "3.2rem",
                color: hsl(80, 0.5),
                textShadow: `0 0 20px ${hsl(60, 0.3)}, 0 0 40px ${hsl(60, 0.15)}`,
                filter: mouse.active ? `brightness(1.2)` : "none",
                transition: `filter 200ms`,
              }}
            >
              {traits.suit}
            </span>
          </div>

          {/* Bottom-right rank + suit (inverted) */}
          <div
            style={{
              lineHeight: 1,
              alignSelf: "flex-end",
              transform: "rotate(180deg)",
            }}
          >
            <div
              style={{
                fontSize: "1.2rem",
                fontWeight: 800,
                color: hsl(85, 0.9),
                textShadow: `0 0 8px ${hsl(60, 0.4)}`,
                fontFamily: "'Georgia', serif",
              }}
            >
              {traits.rank}
            </div>
            <div
              style={{
                fontSize: "1rem",
                color: hsl(75, 0.7),
                marginTop: -2,
              }}
            >
              {traits.suit}
            </div>
          </div>
        </div>

        {/* Name banner at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "6px 10px",
            background: `linear-gradient(transparent, ${hsl(5, 0.85)})`,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              color: hsl(80, 0.85),
              textAlign: "center",
              letterSpacing: "0.04em",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textShadow: `0 1px 4px ${hsl(5, 0.6)}`,
            }}
          >
            {name}
          </div>
        </div>
      </div>

      {/* Info section below the card */}
      {children && (
        <div style={{ marginTop: "0.5rem", width: CARD_WIDTH }}>
          {children}
        </div>
      )}
    </div>
  );
}
