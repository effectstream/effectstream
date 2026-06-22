// Network selector. Ported from app/ZSwap.html (display-only for now).
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

const NETS = [
  { id: 'Undeployed', dot: '#0E9F6E' },
  { id: 'Preview', dot: '#0000FE' },
  { id: 'Preprod', dot: '#6E3BE0' },
  { id: 'Mainnet', dot: '#A98BF0', soon: true },
];

export function NetworkMenu({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, []);
  const cur = NETS.find((n) => n.id === value) || NETS[0];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="zs-btn" onClick={() => setOpen((o) => !o)} style={{ padding: '9px 12px', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cur.dot, flex: '0 0 auto' }} />
        <span style={{ fontWeight: 600 }}>{cur.id}</span>
        <Icon.caret style={{ color: 'var(--ink-3)' }} />
      </button>
      {open && (
        <div className="zs-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 220, padding: 6, zIndex: 50, boxShadow: 'var(--sh-pop)' }}>
          <div className="zs-tag" style={{ padding: '8px 10px 6px' }}>Network</div>
          {NETS.map((n) => (
            <button key={n.id} disabled={n.soon} onClick={() => { if (!n.soon) { onChange(n.id); setOpen(false); } }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px', border: 'none', borderRadius: 10, background: value === n.id ? 'var(--surface-2)' : 'transparent', cursor: n.soon ? 'not-allowed' : 'pointer', opacity: n.soon ? 0.5 : 1, fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.dot, flex: '0 0 auto' }} />
              <span style={{ flex: 1, textAlign: 'left' }}>{n.id}</span>
              {n.soon ? <span className="zs-pill" style={{ padding: '3px 8px', fontSize: 10.5 }}>coming soon</span> : value === n.id ? <Icon.shield style={{ color: 'var(--accent)' }} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
