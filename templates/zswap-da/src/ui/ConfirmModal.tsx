// Generic confirm dialog used before settling a take (and other irreversible
// actions). Shows a pay→receive summary and runs an async action with a busy
// state + inline error.

import { useState } from 'react';
import { Modal, ModalHead } from './Modal';
import { Coin, Icon } from './icons';
import { dlog } from '../debug';

export interface ConfirmPayload {
  title: string;
  pay: { sym: string; amt: string };
  receive: { sym: string; amt: string };
  shielded?: boolean;
  cta: string;
  /** When set, the offer can't be funded by the wallet — reason is shown and the
   *  confirm CTA is disabled (never start a settle the wallet can't complete). */
  blocked?: string;
  onConfirm: () => Promise<void>;
}

export function ConfirmModal({ payload, onClose }: { payload: ConfirmPayload | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!payload || payload.blocked) return;
    const t0 = performance.now();
    dlog(`━━━ CONFIRM PRESSED: "${payload.cta}" ━━━`, {
      title: payload.title,
      pay: `${payload.pay.amt} ${payload.pay.sym}`,
      receive: `${payload.receive.amt} ${payload.receive.sym}`,
      shielded: payload.shielded,
    });
    setBusy(true);
    setErr(null);
    try {
      await payload.onConfirm();
      dlog(`✓✓✓ CONFIRM DONE: "${payload.cta}" (${(performance.now() - t0).toFixed(0)}ms) ✓✓✓`);
      onClose();
    } catch (e: any) {
      dlog(`✗✗✗ CONFIRM FAILED: "${payload.cta}" (${(performance.now() - t0).toFixed(0)}ms) ✗✗✗`, {
        name: e?.name,
        message: e?.message,
        cause: e?.cause,
        raw: e,
      });
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!payload} onClose={busy ? () => {} : onClose} width={440}>
      {payload && (
        <>
          <ModalHead title={payload.title} onClose={busy ? () => {} : onClose} />
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 'var(--r-field)', background: 'var(--surface-2)', marginBottom: 8 }}>
              <Coin sym={payload.pay.sym} size="sm" />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>You pay</span>
                <span className="zs-num" style={{ fontWeight: 700, fontSize: 15 }}>{payload.pay.amt} {payload.pay.sym}</span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '-2px 0' }}><Icon.arrow style={{ color: 'var(--ink-3)', transform: 'rotate(90deg)' }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 'var(--r-field)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }}>
              <Coin sym={payload.receive.sym} size="sm" />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>You receive</span>
                <span className="zs-num" style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>{payload.receive.amt} {payload.receive.sym}</span>
              </span>
              {payload.shielded && <span className="zs-badge-shield" style={{ marginLeft: 'auto' }}><Icon.shield /> Shielded</span>}
            </div>

            {(err ?? payload.blocked) && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--neg)', lineHeight: 1.45, wordBreak: 'break-word' }}>{err ?? payload.blocked}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="zs-btn" style={{ flex: '0 0 auto', padding: '12px 16px' }} disabled={busy} onClick={onClose}>Cancel</button>
              <button className="zs-btn zs-btn--primary" style={{ flex: 1, justifyContent: 'center', padding: 12, opacity: payload.blocked ? 0.5 : 1, cursor: payload.blocked ? 'not-allowed' : 'pointer' }} disabled={busy || !!payload.blocked} onClick={run}>
                {busy ? 'Settling…' : <><Icon.bolt /> {payload.cta}</>}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
