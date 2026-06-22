// Modal shell + header. Ported from app/ui.jsx.
import { useEffect, type ReactNode } from 'react';

export function Modal({ open, onClose, children, width = 420 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,12,20,.42)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'zsfade .15s ease' }}>
      <div onClick={(e) => e.stopPropagation()} className="zs-card" style={{ width, maxWidth: '100%', maxHeight: '86vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'zspop .18s cubic-bezier(.2,.8,.3,1)' }}>
        {children}
      </div>
    </div>
  );
}

export function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>{title}</span>
      <button onClick={onClose} className="zs-btn zs-btn--ghost" style={{ padding: 6, width: 32, height: 32, justifyContent: 'center' }} aria-label="Close">✕</button>
    </div>
  );
}
