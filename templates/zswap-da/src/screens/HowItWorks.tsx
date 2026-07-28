// How it works — ported from the mock's howitworks.jsx: shielded vs unshielded
// explainer + the animated ZSwap lifecycle. Token lists are driven by the real
// known-tokens registry (grouped by kind) instead of the mock symbol table.

import { useEffect, useState } from 'react';
import { Coin, Icon, Mark } from '../ui/icons';
import { shortToken } from '../utils';
import type { KnownToken } from '../types';
import type { ZSwapApp } from '../state/useZSwapApp';

function CelestiaMark({ size = 14 }: { size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: 4, flex: '0 0 auto', background: 'linear-gradient(135deg,#7B2BF9,#C04CFC)', transform: 'rotate(45deg)', boxShadow: '0 0 0 1.5px rgba(123,43,249,.25)' }} />;
}
function CelestiaBadge({ big }: { big?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: big ? '6px 12px 6px 9px' : '4px 9px 4px 7px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(123,43,249,.10), rgba(192,76,252,.10))', border: '1px solid rgba(123,43,249,.28)' }}>
      <CelestiaMark size={big ? 15 : 12} />
      <span style={{ fontSize: big ? 14 : 11.5, fontWeight: 700, letterSpacing: '-.01em', color: '#7B2BF9', whiteSpace: 'nowrap' }}>Celestia</span>
    </span>
  );
}
function MidnightBadge({ big }: { big?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: big ? '6px 12px 6px 8px' : '4px 9px 4px 6px', borderRadius: 999, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }}>
      <Mark size={big ? 15 : 13} color="var(--accent)" />
      <span style={{ fontSize: big ? 14 : 11.5, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--accent)', whiteSpace: 'nowrap' }}>Midnight</span>
    </span>
  );
}

function PhaseShell({ active, last, icon, children }: { active: boolean; last?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  const on = active;
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', color: on ? '#fff' : 'var(--ink-3)', background: on ? 'var(--accent)' : 'var(--surface-3)', transform: on ? 'scale(1.08)' : 'none', boxShadow: on ? '0 8px 18px -6px var(--accent)' : 'none', transition: 'all .3s' }}>{icon}</span>
        {!last && <span style={{ flex: 1, width: 2, marginTop: 4, background: on ? 'var(--accent)' : 'var(--line)', transition: 'background .3s' }} />}
      </div>
      <div style={{ paddingBottom: last ? 4 : 16, flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function AnimatedLifecycle() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => setActive((a) => (a + 1) % 3), 2800);
    return () => clearInterval(iv);
  }, [paused]);

  const head = (n: number, on: boolean, title: string, badge?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="zs-num" style={{ fontSize: 12, color: on ? 'var(--accent)' : 'var(--ink-3)', fontWeight: 700, transition: 'color .3s' }}>0{n}</span>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', color: on ? 'var(--ink)' : 'var(--ink-2)', transition: 'color .3s' }}>{title}</h3>
      {badge}
    </div>
  );
  const body = (on: boolean): React.CSSProperties => ({ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 520, opacity: on ? 1 : 0.55, transition: 'opacity .3s' });
  const phaseBg = (i: number): React.CSSProperties => ({ borderRadius: 16, padding: '12px 12px', cursor: 'pointer', background: active === i ? 'var(--accent-soft)' : 'transparent', transition: 'background .3s' });
  const hover = (i: number) => ({ onMouseEnter: () => { setPaused(true); setActive(i); }, onMouseLeave: () => setPaused(false), onClick: () => setActive(i) });

  return (
    <div className="zs-card" style={{ padding: '24px 22px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="zs-tag">The ZSwap lifecycle</span>
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} onClick={() => setActive(i)} style={{ width: i === active ? 18 : 7, height: 7, borderRadius: 4, background: i === active ? 'var(--accent)' : 'var(--line)', cursor: 'pointer', transition: 'all .3s' }} />
          ))}
        </div>
      </div>

      <div {...hover(0)} style={phaseBg(0)}>
        <PhaseShell active={active === 0} icon={<Icon.wallet />}>
          {head(1, active === 0, 'Connect a wallet')}
          <p style={body(active === 0)}>Connect <a href="https://www.lace.io/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Lace</a> or any Midnight-compatible wallet (on Undeployed, a built-in JS wallet is offered). Your address is never shared on-chain.</p>
        </PhaseShell>
      </div>

      <div {...hover(1)} style={phaseBg(1)}>
        <PhaseShell active={active === 1} icon={<Icon.swap />}>
          {head(2, active === 1, 'Trade — two ways, both peer-to-peer')}
          <p style={body(active === 1)}>Take an open order to match <b>instantly</b>, or post your own. Either path settles directly with a counterparty — no pools, no middlemen.</p>
          <div className="zs-grid2" style={{ gap: 10, marginTop: 12, opacity: active === 1 ? 1 : 0.55, transition: 'opacity .3s' }}>
            <div style={{ padding: 12, borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}><Icon.bolt style={{ color: 'var(--pos)' }} /> Match instantly</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>Take an existing order — it fills in full, right away.</div>
            </div>
            <div style={{ padding: 12, borderRadius: 13, border: '1px solid var(--accent-line)', background: 'var(--accent-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13.5, marginBottom: 4, flexWrap: 'wrap' }}><Icon.shield style={{ color: 'var(--accent)' }} /> Post an order <CelestiaBadge /></div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>Shielded or unshielded — stored on Celestia until a counterpart takes it.</div>
            </div>
          </div>
        </PhaseShell>
      </div>

      <div {...hover(2)} style={phaseBg(2)}>
        <PhaseShell active={active === 2} last icon={<Icon.spark />}>
          {head(3, active === 2, 'Settles on Midnight', <MidnightBadge />)}
          <p style={body(active === 2)}>The ZSwap finalizes on Midnight with zero-knowledge proofs and both sides receive their tokens. <b>Shielded</b> swaps leave no public trace.</p>
        </PhaseShell>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px 4px', marginTop: 6, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <span className="zs-tag">Data-availability partner</span>
        <CelestiaBadge big />
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Open orders live on Celestia — decentralized & censorship-resistant.</span>
      </div>
    </div>
  );
}

function TokenList({ tokens, emptyHint }: { tokens: KnownToken[]; emptyHint: string }) {
  if (tokens.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{emptyHint}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {tokens.slice(0, 6).map((t) => (
        <div key={t.token_color} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Coin sym={t.name} size="sm" />
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{t.name}</span>
          <span className="zs-num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{shortToken(t.token_color)}</span>
        </div>
      ))}
    </div>
  );
}

export function HowItWorks({ st, onGo }: { st: ZSwapApp; onGo?: (page: 'swap') => void }) {
  const shielded = st.knownTokens.filter((t) => t.kind === 'shielded');
  const unshielded = st.knownTokens.filter((t) => t.kind === 'unshielded');

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <div style={{ maxWidth: 640, marginBottom: 34 }}>
        <span className="zs-badge-shield" style={{ marginBottom: 14 }}><Icon.shield /> Privacy by design</span>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 12px', lineHeight: 1.05 }}>How ZSwap works</h1>
        <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
          ZSwap is a peer-to-peer exchange where private trades are <b>zero-knowledge orders</b>. There are no pools to route through and no
          counterparty to reveal — you post an intent, someone completes it, and the swap settles privately.
        </p>
      </div>

      <div className="zs-grid2" style={{ gap: 16, marginBottom: 34 }}>
        <div className="zs-card" style={{ padding: 22, borderColor: 'var(--accent-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 17 }}><Icon.shield style={{ color: 'var(--accent)' }} /> Shielded tokens</span>
            <span className="zs-badge-shield">private</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 16px' }}>Traded via <b>ZSwaps</b>. Amounts are hidden and the order book is zero-knowledge.</p>
          <TokenList tokens={shielded} emptyHint="No shielded tokens yet — mint some on the Faucet." />
        </div>
        <div className="zs-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 17 }}><Icon.eye /> Unshielded tokens</span>
            <span className="zs-pill">public</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 16px' }}>Swap in the open — balances and trades are visible on-chain.</p>
          <TokenList tokens={unshielded} emptyHint="No unshielded tokens yet — mint some on the Faucet." />
        </div>
      </div>

      <AnimatedLifecycle />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 22, padding: '20px 24px', borderRadius: 'var(--r-card)', background: 'var(--ink)', color: '#fff', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Icon.drop style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>Posting beyond instant depth makes you a liquidity provider — and keeps ZSwap deep and private.</span>
        </div>
        <button className="zs-btn zs-btn--primary" onClick={() => onGo?.('swap')}>Start swapping <Icon.arrow /></button>
      </div>
    </div>
  );
}
