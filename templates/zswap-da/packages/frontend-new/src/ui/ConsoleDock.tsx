// ConsoleDock — a static, collapsible "trading console" docked above the footer.
// Two columns: Place Order (left, compact) and My trades (right). Collapses to a
// single title bar so the order book above it keeps the focus. The black
// open-source bar (Footer) sits directly below this.

import { Icon } from './icons';
import { PlaceOrderForm } from '../screens/Swap';
import { MyTrades } from '../screens/MyTrades';
import { log } from '../lib/log';
import type { ZSwapApp } from '../state/useZSwapApp';

function ColLabel({ children }: { children: React.ReactNode }) {
  return <div className="zs-tag" style={{ marginBottom: 10 }}>{children}</div>;
}

export function ConsoleDock({ st, open, onToggle, dockRef, requestPayPicker, onPayPickerHandled }: {
  st: ZSwapApp;
  open: boolean;
  onToggle: () => void;
  dockRef?: React.Ref<HTMLElement>;
  requestPayPicker?: boolean;
  onPayPickerHandled?: () => void;
}) {
  const openCount = st.myTrades.filter((t) => t.status === 'open').length;

  const copyLog = async () => {
    const ok = await log.copy();
    st.toast(ok ? 'Debug log copied to clipboard' : 'Copy failed — run zlog.dump() in the console', ok ? 'ok' : undefined);
  };

  return (
    <section ref={dockRef} data-density="compact" style={{ position: 'relative', zIndex: 30, borderTop: '1px solid var(--line)', background: 'var(--bg-tint)', boxShadow: '0 -12px 30px -14px rgba(10,12,20,.30), 0 -2px 8px -4px rgba(10,12,20,.14)' }}>
      {/* full-width on desktop (not capped to the 1180 app column) */}
      <div style={{ padding: '0 24px' }}>
        {/* console title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '13px 2px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--pos)', boxShadow: '0 0 0 3px var(--pos-soft)' }} />
            <span className="zs-num" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>Place order</span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>My trades</span>
          {openCount > 0 && (
            <span className="zs-badge-shield" style={{ background: 'var(--pos-soft)', color: 'var(--pos)', border: '1px solid color-mix(in srgb, var(--pos) 25%, transparent)' }}>
              {openCount} open
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
            {open ? 'Collapse' : 'Expand'}
            <Icon.caret style={{ transform: open ? 'none' : 'rotate(180deg)', transition: 'transform .18s' }} />
          </span>
        </button>
          <button onClick={copyLog} title="Copy the in-app debug log to the clipboard"
            style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', cursor: 'pointer' }}>
            Copy log
          </button>
        </div>

        {open && (
          <div className="zs-console-grid" style={{ paddingBottom: 26 }}>
            <div style={{ minWidth: 0 }}>
              <ColLabel>Place order</ColLabel>
              <PlaceOrderForm st={st} compact requestPayPicker={requestPayPicker} onPayPickerHandled={onPayPickerHandled} />
            </div>
            <div style={{ minWidth: 0 }}>
              <ColLabel>My trades</ColLabel>
              <MyTrades st={st} compact />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
