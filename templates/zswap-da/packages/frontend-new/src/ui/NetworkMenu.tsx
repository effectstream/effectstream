// Network badge — read-only display of the active network. The network is
// determined by the server config (VITE_MIDNIGHT_NETWORK_ID); users cannot
// switch networks from the UI.

const NET_DOTS: Record<string, string> = {
  Undeployed: '#0E9F6E',
  Preview:    '#0000FE',
  Preprod:    '#6E3BE0',
  Mainnet:    '#A98BF0',
};

export function NetworkMenu({ value }: { value: string }) {
  const dot = NET_DOTS[value] ?? '#888888';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 12px', borderRadius: 10,
      border: '1px solid var(--line)', background: 'var(--bg-tint)',
      fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: '0 0 auto' }} />
      <span>{value}</span>
    </div>
  );
}
