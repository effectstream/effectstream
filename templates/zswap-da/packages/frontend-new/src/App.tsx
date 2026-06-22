// frontend-new — app shell.
// Step 1: design system + static nav. Step 2: real wallet connect + balances.
// Screens/data wired in from Step 3 onward via the `st` adapter (useZSwapApp).

import { useState } from 'react';
import './styles/tokens.css';
import { Wordmark, Icon } from './ui/icons';
import { Footer } from './ui/Footer';
import { ConnectModal } from './ui/ConnectModal';
import { Toasts } from './ui/Toasts';
import { WalletMenu } from './ui/WalletMenu';
import { NetworkMenu } from './ui/NetworkMenu';
import { useZSwapApp } from './state/useZSwapApp';
import { Market } from './screens/Market';
import { Faucet } from './screens/Faucet';
import { Swap } from './screens/Swap';
import { MyTrades } from './screens/MyTrades';
import { HowItWorks } from './screens/HowItWorks';
import { ConfirmModal } from './ui/ConfirmModal';
import { shortToken } from './utils';
import { fmtBalance } from './state/format';

type PageId = 'market' | 'swap' | 'trades' | 'how' | 'faucet';

const TABS: [PageId, string][] = [
  ['market', 'Order book'],
  ['swap', 'Place Order'],
  ['trades', 'My trades'],
  ['how', 'How it works'],
  ['faucet', 'Faucet'],
];


function BalancesCard({ title, balances }: { title: string; balances: Record<string, string> | null }) {
  const entries = Object.entries(balances ?? {}).filter(([, v]) => Number(v) > 0);
  return (
    <div className="zs-card" style={{ padding: 20, flex: 1, minWidth: 240 }}>
      <div className="zs-tag" style={{ marginBottom: 12 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No balance</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {entries.map(([color, amt]) => (
            <div key={color} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="zs-num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{shortToken(color)}</span>
              <span className="zs-num" style={{ fontSize: 14, fontWeight: 600 }}>{fmtBalance(amt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<PageId>('market');
  const [menuOpen, setMenuOpen] = useState(false);
  const st = useZSwapApp();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'color-mix(in srgb, var(--bg) 82%, transparent)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 20, position: 'relative' }}>
          <Wordmark size={26} />

          {/* desktop nav */}
          <div className="zs-nav-desktop">
            <div className="zs-seg" style={{ background: 'var(--bg-tint)' }}>
              {TABS.map(([id, lbl]) => (
                <button key={id} className="zs-nav-tab" aria-selected={page === id} onClick={() => setPage(id)}>{lbl}</button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <NetworkMenu value={st.network} onChange={st.setNetwork} />
            <span className="zs-badge-shield" title="Private session"><Icon.shield /> Private session</span>
            {st.wallet ? <WalletMenu st={st} /> : <button className="zs-btn zs-btn--primary" onClick={st.connect}>Connect wallet</button>}
          </div>

          {/* mobile burger */}
          <div className="zs-nav-mobile">
            <button className="zs-burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
              {menuOpen
                ? <svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                : <svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}
            </button>
          </div>

          {menuOpen && (
            <div className="zs-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 16, right: 16, padding: 12, zIndex: 60, boxShadow: 'var(--sh-pop)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TABS.map(([id, lbl]) => (
                <button key={id} onClick={() => { setPage(id); setMenuOpen(false); }}
                  style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, background: page === id ? 'var(--accent-soft)' : 'transparent', color: page === id ? 'var(--accent)' : 'var(--ink)' }}>{lbl}</button>
              ))}
              <hr className="zs-hr" style={{ margin: '6px 0' }} />
              {st.wallet
                ? <button className="zs-btn zs-btn--block" style={{ padding: 13 }} onClick={() => { setMenuOpen(false); st.disconnect(); }}>Disconnect</button>
                : <button className="zs-btn zs-btn--primary zs-btn--block" onClick={() => { setMenuOpen(false); st.connect(); }}>Connect wallet</button>}
            </div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: '32px 24px 80px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {page === 'market' && (
          <div>
            {st.wallet ? (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <BalancesCard title="Shielded balances" balances={st.shieldedBalances} />
                <BalancesCard title="Unshielded balances" balances={st.unshieldedBalances} />
              </div>
            ) : null}
            <Market st={st} onGo={setPage} />
          </div>
        )}
        {page === 'swap' && <Swap st={st} />}
        {page === 'trades' && <MyTrades st={st} />}
        {page === 'how' && <HowItWorks st={st} onGo={setPage} />}
        {page === 'faucet' && <Faucet st={st} />}
      </main>

      <Footer />

      <ConnectModal
        open={st.connectOpen}
        onClose={() => st.setConnectOpen(false)}
        injected={st.injectedOptions}
        onPickInjected={(name) => st.connectInjectedWallet(name || undefined)}
        localAvailable={st.localWalletAvailable}
        onPickLocal={st.connectLocalWallet}
      />
      <ConfirmModal payload={st.pendingConfirm} onClose={st.closeConfirm} />
      <Toasts items={st.toasts} />
    </div>
  );
}
