// Wallet connect modal — wallets discovered via @effectstream/wallets, plus the
// built-in JS wallet (shown only on the undeployed network).
import { Modal, ModalHead } from './Modal';
import { Icon } from './icons';

export interface WalletOptionMeta {
  name: string;
  displayName: string;
  icon?: string;
}

function brandTint(name: string): string {
  if (name === 'midnight-local') return '#0000FE';
  return '#5A6473';
}

function Row({ tint, glyph, icon, title, sub, onClick }: { tint: string; glyph?: string; icon?: string; title: string; sub?: string; onClick: () => void }) {
  const hasIcon = !!(icon || glyph);
  return (
    <div onClick={onClick} className="zs-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 13, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--line)', background: 'var(--surface)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}>
      {hasIcon && (
        <span style={{ width: 36, height: 36, borderRadius: 10, background: tint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: glyph && glyph.length > 1 ? 12 : 18, fontWeight: 700, flex: '0 0 auto', overflow: 'hidden' }}>
          {icon ? <img src={icon} alt="" style={{ width: 36, height: 36, objectFit: 'cover' }} /> : glyph}
        </span>
      )}
      <span style={{ flex: 1, fontWeight: 700, fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        {title}{sub && <span className="zs-pill" style={{ padding: '3px 8px', fontSize: 10.5 }}>{sub}</span>}
      </span>
      <Icon.arrow style={{ color: 'var(--ink-3)' }} />
    </div>
  );
}

export function ConnectModal({
  open,
  onClose,
  injected,
  onPickInjected,
  localAvailable,
  onPickLocal,
}: {
  open: boolean;
  onClose: () => void;
  injected: WalletOptionMeta[];
  onPickInjected: (name: string) => void;
  localAvailable: boolean;
  onPickLocal: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} width={400}>
      <ModalHead title="Connect a wallet" onClose={onClose} />
      <div style={{ padding: 16 }}>
        <div className="zs-badge-shield" style={{ marginBottom: 14 }}><Icon.shield /> Your address is never shared on-chain</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {injected.map((w) => (
            <Row key={w.name} tint={brandTint(w.name)} glyph="◧" icon={w.icon} title={w.displayName} onClick={() => onPickInjected(w.name)} />
          ))}
          {injected.length === 0 && (
            <div role="status" className="zs-card" style={{ padding: 13, border: '1px solid var(--line)', background: 'var(--surface)', lineHeight: 1.45 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>No compatible browser wallet detected</div>
              <div style={{ marginTop: 4, color: 'var(--ink-3)', fontSize: 12 }}>
                Install or enable a Midnight wallet that supports transaction signing, then reopen this dialog.
              </div>
            </div>
          )}
          {localAvailable && (
            <Row tint="#0000FE" glyph="JS" title="JS Wallet" sub="local · undeployed" onClick={onPickLocal} />
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
          {localAvailable ? 'The JS wallet runs entirely in your browser — no extension needed (undeployed only).' : 'Connecting your wallet does not share any information.'}
        </p>
      </div>
    </Modal>
  );
}
