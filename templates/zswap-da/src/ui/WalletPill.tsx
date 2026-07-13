// Connected-wallet pill. Ported from app/ui.jsx.
export interface WalletInfo {
  id: string;
  tint: string;
  glyph: string;
  name?: string;
}

export function WalletPill({ wallet, onClick }: { wallet: WalletInfo; onClick: () => void }) {
  return (
    <button onClick={onClick} className="zs-btn" style={{ padding: '8px 10px 8px 12px', gap: 10 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <span className="zs-num" style={{ fontSize: 13.5, fontWeight: 600 }}>{wallet.id}</span>
      </span>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: wallet.tint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{wallet.glyph}</span>
    </button>
  );
}
