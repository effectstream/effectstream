// Bottom-center toast stack. Ported from app/ui.jsx.
import { Icon } from './icons';

export interface ToastItem {
  id: string;
  msg: string;
  kind?: 'ok' | string;
}

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      {items.map((t) => (
        <div key={t.id} className="zs-card" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', animation: 'zspop .2s cubic-bezier(.2,.8,.3,1)', boxShadow: 'var(--sh-pop)' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: t.kind === 'ok' ? 'var(--pos-soft)' : 'var(--accent-soft)', color: t.kind === 'ok' ? 'var(--pos)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{t.kind === 'ok' ? <Icon.shield /> : <Icon.bolt />}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
