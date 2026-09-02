// zswap-da frontend — app shell.
// Step 1: design system + static nav. Step 2: real wallet connect + balances.
// Screens/data wired in from Step 3 onward via the `st` adapter (useZSwapApp).

import { useRef, useState } from 'react';
import './styles/tokens.css';
import { Wordmark, Icon } from './ui/icons';
import { Footer } from './ui/Footer';
import { ConsoleDock } from './ui/ConsoleDock';
import { ConnectModal } from './ui/ConnectModal';
import { Toasts } from './ui/Toasts';
import { WalletMenu } from './ui/WalletMenu';
import { NetworkMenu } from './ui/NetworkMenu';
import { SyncBanner } from './ui/SyncBanner';
import { useZSwapApp } from './state/useZSwapApp';
import { Market } from './screens/Market';
import { Faucet } from './screens/Faucet';
import { HowItWorks } from './screens/HowItWorks';
import { ConfirmModal } from './ui/ConfirmModal';
import { DecisionModal } from './ui/DecisionModal';
// Place Order + My trades live in the bottom console dock, not in the top nav.
type PageId = 'market' | 'how' | 'faucet';

const TABS: [PageId, string][] = [
  ['market', 'Order book'],
  ['how', 'How it works'],
  ['faucet', 'Faucet'],
];

export default function App() {
  const [page, setPage] = useState<PageId>('market');
  const [menuOpen, setMenuOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [payPickerOpen, setPayPickerOpen] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const st = useZSwapApp();

  // Links that used to navigate to the Place Order screen now reveal the console.
  const openConsole = () => {
    setConsoleOpen(true);
    setTimeout(() => dockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60);
  };
  // "Start an order" CTAs: reveal the console AND pop the Pay-with token picker
  // so the flow begins immediately.
  const startOrder = () => { openConsole(); setPayPickerOpen(true); };

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
            <NetworkMenu value={st.network} />
            <span className="zs-badge-shield" title="Private session"><Icon.shield /> Private session</span>
            {st.wallet ? <WalletMenu st={st} /> : <button className="zs-btn zs-btn--secondary" onClick={st.connect}>Connect wallet</button>}
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
                : <button className="zs-btn zs-btn--secondary zs-btn--block" onClick={() => { setMenuOpen(false); st.connect(); }}>Connect wallet</button>}
            </div>
          )}
        </div>
      </header>
      <SyncBanner />

      <main style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: '32px 24px 40px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {page === 'market' && <Market st={st} onStartOrder={startOrder} />}
        {page === 'how' && <HowItWorks st={st} onGo={startOrder} />}
        {page === 'faucet' && <Faucet st={st} />}
      </main>

      <ConsoleDock st={st} open={consoleOpen} onToggle={() => setConsoleOpen((o) => !o)} dockRef={dockRef}
        requestPayPicker={payPickerOpen} onPayPickerHandled={() => setPayPickerOpen(false)} />

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
      {/* Asked BEFORE the confirm dialog when a selection contains your own
          offers — answering it opens the confirm dialog (or settles nothing). */}
      <DecisionModal payload={st.pendingDecision} onClose={st.closeDecision} />
      <Toasts items={st.toasts} />
    </div>
  );
}
