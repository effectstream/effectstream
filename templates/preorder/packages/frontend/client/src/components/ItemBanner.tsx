import React, { useEffect, useRef, useState } from "react";

function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxW: number, baseFontWeight: string, baseFontFamily: string, idealSize: number): number {
  let size = idealSize;
  while (size > 8) {
    ctx.font = `${baseFontWeight} ${size}px ${baseFontFamily}`;
    if (ctx.measureText(text).width <= maxW * 0.85) return size;
    size -= 1;
  }
  return size;
}

type EffectFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, text: string) => void;

const effects: Record<number, EffectFn> = {
  // 1: Iron Helm — cycling hue gradient background + pulsing glow text
  1: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, `hsl(${(t * 30) % 360}, 60%, 12%)`);
    grd.addColorStop(1, `hsl(${(t * 30 + 120) % 360}, 50%, 8%)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    const base = 28 + Math.sin(t * 1.5) * 6;
    const size = fitFontSize(ctx, text, w, "bold", "sans-serif", base);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glow = `hsl(${(t * 40) % 360}, 80%, 65%)`;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20 + Math.sin(t * 2) * 10;
    ctx.fillStyle = glow;
    ctx.fillText(text, w / 2, h / 2);
    ctx.shadowBlur = 0;
  },

  // 2: Steel Longsword — per-character wave with rainbow hue shift
  2: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a1a0a";
    ctx.fillRect(0, 0, w, h);
    const idealCharW = 22;
    const totalIdealWidth = text.length * idealCharW;
    const maxCharSize = 24;
    const charSize = fitFontSize(ctx, "M", w / text.length * 0.85, "bold", "sans-serif", maxCharSize);
    ctx.font = `bold ${charSize}px sans-serif`;
    const charWidths = text.split("").map((ch) => ctx.measureText(ch).width);
    const totalW = charWidths.reduce((a, b) => a + b, 0);
    const spacing = Math.min(idealCharW, (w * 0.85) / text.length);
    let x = (w - spacing * text.length) / 2 + spacing / 2;
    text.split("").forEach((ch, i) => {
      const phase = t * 2 + i * 0.4;
      const y = h / 2 + Math.sin(phase) * 18;
      const scale = 1 + Math.sin(phase + 1) * 0.15;
      const hue = (120 + i * 15 + t * 20) % 360;
      ctx.save();
      ctx.translate(x + i * spacing, y);
      ctx.scale(scale, scale);
      ctx.font = `bold ${charSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
      ctx.shadowColor = `hsl(${hue}, 70%, 40%)`;
      ctx.shadowBlur = 8;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  },

  // 3: Enchanted Shield — concentric rings + purple pulse
  3: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#120a1a";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const radius = 30 + i * 20 + Math.sin(t + i) * 15;
      const alpha = 0.08 - i * 0.012;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 120, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const stretch = 1 + Math.sin(t * 1.2) * 0.08;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(stretch, 2 - stretch);
    const size = fitFontSize(ctx, text, w, "bold", "sans-serif", 26);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#c084fc";
    ctx.shadowColor = "#a855f7";
    ctx.shadowBlur = 25 + Math.sin(t * 3) * 15;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  },

  // 4: Mithril Chainmail — orbiting gold sparks + rotating text
  4: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1a1a08";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + t * 0.5;
      const r = 50 + Math.sin(t * 2 + i) * 10;
      const x = w / 2 + Math.cos(angle) * r;
      const y = h / 2 + Math.sin(angle) * r;
      const sparkSize = 2 + Math.sin(t * 3 + i * 0.7) * 1.5;
      ctx.beginPath();
      ctx.arc(x, y, sparkSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(250, 204, 21, ${0.4 + Math.sin(t * 4 + i) * 0.3})`;
      ctx.fill();
    }
    const rotation = Math.sin(t * 0.8) * 0.06;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rotation);
    const size = fitFontSize(ctx, text, w, "bold", "sans-serif", 26);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fbbf24";
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 15 + Math.sin(t * 2.5) * 10;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  },

  // 5: Healing Potion — bubbling particles rising + liquid wave background
  5: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);
    // Dark teal gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#041210");
    bg.addColorStop(1, "#0a2420");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Liquid wave at bottom
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 2) {
      const y = h * 0.7 + Math.sin(x * 0.03 + t * 2) * 8 + Math.sin(x * 0.07 + t * 3) * 4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = "rgba(16, 185, 129, 0.12)";
    ctx.fill();

    // Rising bubbles (deterministic from time)
    for (let i = 0; i < 20; i++) {
      const seed = i * 137.5;
      const bx = ((seed * 7.3) % w);
      const speed = 0.3 + (i % 5) * 0.15;
      const by = h - ((t * speed * 40 + seed * 3) % (h + 20));
      const radius = 1.5 + (i % 4) * 1.2;
      const alpha = 0.15 + Math.sin(t * 2 + i) * 0.1;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
      ctx.fill();
      // Bubble highlight
      ctx.beginPath();
      ctx.arc(bx - radius * 0.3, by - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167, 243, 208, ${alpha * 0.8})`;
      ctx.fill();
    }

    // Glowing text
    const size = fitFontSize(ctx, text, w, "bold", "sans-serif", 28);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pulse = 0.6 + Math.sin(t * 1.5) * 0.4;
    ctx.shadowColor = `rgba(52, 211, 153, ${pulse})`;
    ctx.shadowBlur = 20 + Math.sin(t * 2) * 12;
    ctx.fillStyle = "#6ee7b7";
    ctx.fillText(text, w / 2, h * 0.38);
    ctx.shadowBlur = 0;
  },

  // 6: Arcane Spellbook — rotating rune circle + electric arcs
  6: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0c0a18";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;

    // Outer rune circle — slowly rotating
    const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
    const runeCount = 16;
    const runeRadius = Math.min(w, h) * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.3);
    for (let i = 0; i < runeCount; i++) {
      const angle = (Math.PI * 2 * i) / runeCount;
      const rx = Math.cos(angle) * runeRadius;
      const ry = Math.sin(angle) * runeRadius;
      const flicker = 0.3 + Math.sin(t * 4 + i * 2.1) * 0.3;
      ctx.font = "12px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(139, 92, 246, ${flicker})`;
      ctx.fillText(runes[i % runes.length], rx, ry);
    }
    ctx.restore();

    // Electric arcs — jagged lines from center outward
    for (let i = 0; i < 3; i++) {
      const arcAngle = t * 1.5 + i * 2.1;
      const arcLen = 25 + Math.sin(t * 5 + i * 3) * 15;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      let px = cx, py = cy;
      for (let s = 0; s < 6; s++) {
        const frac = (s + 1) / 6;
        const jitterX = (Math.sin(t * 12 + s * 7 + i * 13) * 12) * frac;
        const jitterY = (Math.cos(t * 11 + s * 5 + i * 11) * 12) * frac;
        px = cx + Math.cos(arcAngle) * arcLen * frac + jitterX;
        py = cy + Math.sin(arcAngle) * arcLen * frac + jitterY;
        ctx.lineTo(px, py);
      }
      const alpha = 0.4 + Math.sin(t * 6 + i) * 0.3;
      ctx.strokeStyle = `rgba(167, 139, 250, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#7c3aed";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Inner glowing circle
    const innerR = 28 + Math.sin(t * 2) * 4;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
    grad.addColorStop(0, "rgba(139, 92, 246, 0.15)");
    grad.addColorStop(1, "rgba(139, 92, 246, 0)");
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Text
    const size = fitFontSize(ctx, text, w, "bold", "sans-serif", 24);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#c4b5fd";
    ctx.shadowColor = "#8b5cf6";
    ctx.shadowBlur = 18 + Math.sin(t * 3) * 8;
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 0;
  },

  // 7: Dragon Scale Armor — layered scales pattern + fire embers raining down
  7: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1a0808";
    ctx.fillRect(0, 0, w, h);

    // Animated scale pattern
    const scaleW = 18, scaleH = 12;
    const cols = Math.ceil(w / scaleW) + 1;
    const rows = Math.ceil(h / scaleH) + 1;
    const scrollY = (t * 8) % scaleH;
    for (let row = -1; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : scaleW / 2;
      for (let col = -1; col < cols; col++) {
        const sx = col * scaleW + offset;
        const sy = row * scaleH + scrollY;
        const dist = Math.hypot(sx - w / 2, sy - h / 2) / (w / 2);
        const hue = 15 + Math.sin(t * 0.5 + dist * 3) * 10;
        const light = 12 + Math.sin(t + col * 0.3 + row * 0.5) * 3;
        ctx.beginPath();
        ctx.ellipse(sx, sy, scaleW * 0.45, scaleH * 0.55, 0, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, 70%, ${light}%)`;
        ctx.fill();
        ctx.strokeStyle = `hsl(${hue}, 60%, ${light + 6}%)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // Fire embers drifting up
    for (let i = 0; i < 30; i++) {
      const seed = i * 97.3;
      const ex = (seed * 3.7) % w;
      const speed = 0.4 + (i % 6) * 0.12;
      const ey = h - ((t * speed * 50 + seed * 2) % (h + 40)) + 20;
      const drift = Math.sin(t * 1.5 + i * 0.8) * 8;
      const radius = 0.8 + (i % 3) * 0.6;
      const life = Math.max(0, 1 - ey / h);
      const hue = 20 + (i % 30);
      ctx.beginPath();
      ctx.arc(ex + drift, ey, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 100%, ${55 + life * 20}%, ${0.3 + life * 0.5})`;
      ctx.fill();
    }

    // Text with fire glow
    const size = fitFontSize(ctx, text, w, "bold", "sans-serif", 26);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fireHue = 25 + Math.sin(t * 3) * 15;
    ctx.fillStyle = `hsl(${fireHue}, 100%, 65%)`;
    ctx.shadowColor = `hsl(${fireHue - 10}, 100%, 50%)`;
    ctx.shadowBlur = 25 + Math.sin(t * 4) * 15;
    ctx.fillText(text, w / 2, h / 2);
    // Second pass for extra glow
    ctx.shadowColor = "rgba(255, 100, 0, 0.5)";
    ctx.shadowBlur = 40;
    ctx.fillText(text, w / 2, h / 2);
    ctx.shadowBlur = 0;
  },

  // 8: Phoenix Staff — swirling fire vortex + plasma text
  8: (ctx, w, h, t, text) => {
    ctx.clearRect(0, 0, w, h);

    // Deep dark background with subtle gradient
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
    bg.addColorStop(0, "#1a0a02");
    bg.addColorStop(1, "#080204");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;

    // Swirling fire vortex — multiple spiral arms
    for (let arm = 0; arm < 4; arm++) {
      const armOffset = (Math.PI * 2 * arm) / 4;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) {
        const frac = i / 60;
        const spiralAngle = frac * Math.PI * 3 + t * 2 + armOffset;
        const radius = 10 + frac * (Math.min(w, h) * 0.4);
        const wobble = Math.sin(t * 3 + i * 0.3 + arm) * 3;
        const px = cx + Math.cos(spiralAngle) * (radius + wobble);
        const py = cy + Math.sin(spiralAngle) * (radius + wobble);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const hue = 30 + arm * 8 + Math.sin(t * 2) * 10;
      const alpha = 0.12 + Math.sin(t + arm) * 0.06;
      ctx.strokeStyle = `hsla(${hue}, 100%, 55%, ${alpha})`;
      ctx.lineWidth = 2 + Math.sin(t * 2 + arm) * 1;
      ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Core glow
    const coreR = 15 + Math.sin(t * 4) * 5;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, "rgba(255, 200, 50, 0.4)");
    coreGrad.addColorStop(0.5, "rgba(255, 100, 20, 0.15)");
    coreGrad.addColorStop(1, "rgba(200, 50, 0, 0)");
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Orbiting phoenix feather sparks
    for (let i = 0; i < 8; i++) {
      const orbitAngle = t * (1.5 + i * 0.15) + i * (Math.PI * 2 / 8);
      const orbitR = 30 + i * 4 + Math.sin(t * 2 + i) * 6;
      const sx = cx + Math.cos(orbitAngle) * orbitR;
      const sy = cy + Math.sin(orbitAngle) * orbitR;
      // Feather trail
      for (let tr = 0; tr < 4; tr++) {
        const trailAngle = orbitAngle - tr * 0.15;
        const trailR = orbitR - tr * 1;
        const tx = cx + Math.cos(trailAngle) * trailR;
        const ty = cy + Math.sin(trailAngle) * trailR;
        const trAlpha = (0.4 - tr * 0.1) * (0.6 + Math.sin(t * 5 + i) * 0.4);
        ctx.beginPath();
        ctx.arc(tx, ty, 1.5 - tr * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, ${180 - tr * 30}, ${50 - tr * 10}, ${trAlpha})`;
        ctx.fill();
      }
    }

    // Text with plasma effect — layered colored shadows
    const size = fitFontSize(ctx, text, w, "bold", "sans-serif", 28);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Outer red glow
    ctx.shadowColor = "rgba(220, 40, 0, 0.8)";
    ctx.shadowBlur = 30 + Math.sin(t * 3) * 15;
    ctx.fillStyle = "rgba(255, 150, 50, 0.3)";
    ctx.fillText(text, cx, cy);
    // Inner orange
    ctx.shadowColor = "rgba(255, 160, 0, 0.9)";
    ctx.shadowBlur = 15 + Math.sin(t * 4 + 1) * 8;
    ctx.fillStyle = `hsl(${35 + Math.sin(t * 2) * 10}, 100%, 65%)`;
    ctx.fillText(text, cx, cy);
    // Core white-hot
    ctx.shadowColor = "rgba(255, 240, 180, 0.6)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = `hsl(${45 + Math.sin(t * 3) * 5}, 100%, ${78 + Math.sin(t * 5) * 8}%)`;
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 0;
  },
};

// Neutral default effect used for items that have no bespoke effect and no image URL
// (e.g. products added at runtime via the admin console).
const defaultEffect: EffectFn = (ctx, w, h, t, text) => {
  ctx.clearRect(0, 0, w, h);
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "#0d1117");
  grd.addColorStop(1, "#10241c");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) {
    const seed = i * 53.7;
    const x = (seed * 9.1 + t * 14) % w;
    const y = h / 2 + Math.sin(t + i) * (h * 0.32);
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(25, 177, 123, ${0.12 + Math.sin(t * 2 + i) * 0.08})`;
    ctx.fill();
  }
  const size = fitFontSize(ctx, text, w, "bold", "sans-serif", 26);
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#19B17B";
  ctx.shadowColor = "rgba(25, 177, 123, 0.6)";
  ctx.shadowBlur = 16 + Math.sin(t * 2) * 8;
  ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0;
};

export function ItemBanner({ itemId, text, image }: { itemId: number; text: string; image?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const [imgFailed, setImgFailed] = useState(false);

  // Use the image URL when provided (and it loads); otherwise fall back to the canvas effect.
  const showImage = !!image && !imgFailed;

  useEffect(() => {
    if (showImage) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(120 * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = effects[itemId] || defaultEffect;
    let start: number | null = null;

    const loop = (ts: number) => {
      if (!start) start = ts;
      const t = (ts - start) / 1000;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      draw(ctx, w, h, t, text);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frameRef.current); ro.disconnect(); };
  }, [itemId, text, showImage]);

  if (showImage) {
    return (
      <div style={{ width: "100%", height: 120, overflow: "hidden", background: "#0d1117" }}>
        <img
          src={image}
          alt={text}
          onError={() => setImgFailed(true)}
          style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: 120 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 120, display: "block" }}
      />
    </div>
  );
}
