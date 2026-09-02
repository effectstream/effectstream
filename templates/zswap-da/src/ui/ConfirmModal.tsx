// Generic confirm dialog used before settling a take (and other irreversible
// actions). Shows a pay→receive summary and runs an async action with a busy
// state + inline error.
//
// For a multi-offer take every row carries a checkbox: a price level aggregates
// all offers at that price and used to be all-or-nothing. The dialog keeps the
// checked set, and re-derives the totals, the affordability verdict and the CTA
// from it through the payload's `assess` — so the numbers on screen always
// describe what pressing the button will actually settle.

import { useEffect, useMemo, useState } from 'react';
import { Modal, ModalHead } from './Modal';
import { Coin, Icon } from './icons';
import { dlog } from '../debug';

/** What the dialog shows for the current selection. */
export interface ConfirmView {
  pay: { sym: string; amt: string };
  receive: { sym: string; amt: string };
  /** When set, the selection can't be funded by the wallet — reason is shown and
   *  the confirm CTA is disabled (never start a settle the wallet can't
   *  complete). */
  blocked?: string;
  cta: string;
}

export interface ConfirmItem {
  /** Stable identity of the offer — what `onConfirm` receives. */
  id: string;
  pay: string;
  receive: string;
  /** The wallet can cover this row within the affordable set; `false` rows are
   *  muted and marked "can't afford". */
  ok: boolean;
  /** This offer is your own (you chose to include it). */
  mine?: boolean;
  /** Whether the row starts checked. */
  checked: boolean;
}

export interface ConfirmPayload extends ConfirmView {
  title: string;
  shielded?: boolean;
  /** Per-offer breakdown for a batch take. Rendered as a checkbox list when
   *  there is more than one — a single offer keeps the plain dialog. */
  items?: ConfirmItem[];
  /** Recompute the header/CTA for a checked subset. Absent for payloads with no
   *  items, where the static `pay`/`receive`/`blocked`/`cta` stand. */
  assess?: (selectedIds: string[]) => ConfirmView;
  /** Receives the checked ids, in item order (empty when there are no items). */
  onConfirm: (selectedIds: string[]) => Promise<void>;
}

export function ConfirmModal({ payload, onClose }: { payload: ConfirmPayload | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Re-seed for each dialog. Keyed on the payload object: a new take builds a
  // new payload, and nothing mutates one in place.
  useEffect(() => {
    setChecked(new Set((payload?.items ?? []).filter((i) => i.checked).map((i) => i.id)));
    setErr(null);
  }, [payload]);

  const items = payload?.items ?? [];
  // Item order, not click order — the ids travel to the settlement, which pays
  // the offers in the book's best-price-first order.
  const selectedIds = useMemo(() => items.filter((i) => checked.has(i.id)).map((i) => i.id), [items, checked]);
  const view: ConfirmView | null = payload
    ? (payload.assess ? payload.assess(selectedIds) : payload)
    : null;
  const selectable = items.length > 1;
  const nothingChecked = items.length > 0 && selectedIds.length === 0;

  const run = async (label: string) => {
    if (!payload) return;
    const t0 = performance.now();
    dlog(`━━━ CONFIRM PRESSED: "${label}" ━━━`, {
      title: payload.title,
      pay: `${view?.pay.amt} ${view?.pay.sym}`,
      receive: `${view?.receive.amt} ${view?.receive.sym}`,
      shielded: payload.shielded,
      selected: selectedIds.length || undefined,
    });
    setBusy(true);
    setErr(null);
    try {
      await payload.onConfirm(selectedIds);
      dlog(`✓✓✓ CONFIRM DONE: "${label}" (${(performance.now() - t0).toFixed(0)}ms) ✓✓✓`);
      onClose();
    } catch (e: any) {
      dlog(`✗✗✗ CONFIRM FAILED: "${label}" (${(performance.now() - t0).toFixed(0)}ms) ✗✗✗`, {
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

  const toggle = (id: string) => {
    if (busy) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Modal open={!!payload} onClose={busy ? () => {} : onClose} width={440}>
      {payload && view && (
        <>
          <ModalHead title={payload.title} onClose={busy ? () => {} : onClose} />
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 'var(--r-field)', background: 'var(--surface-2)', marginBottom: 8 }}>
              <Coin sym={view.pay.sym} size="sm" />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>You pay</span>
                <span className="zs-num" style={{ fontWeight: 700, fontSize: 15 }}>{view.pay.amt} {view.pay.sym}</span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '-2px 0' }}><Icon.arrow style={{ color: 'var(--ink-3)', transform: 'rotate(90deg)' }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 'var(--r-field)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }}>
              <Coin sym={view.receive.sym} size="sm" />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>You receive</span>
                <span className="zs-num" style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>{view.receive.amt} {view.receive.sym}</span>
              </span>
              {payload.shielded && <span className="zs-badge-shield" style={{ marginLeft: 'auto' }}><Icon.shield /> Shielded</span>}
            </div>

            {selectable && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }}>
                  <span className="zs-tag">Offers in this take</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{selectedIds.length} of {items.length} selected</span>
                </div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-field)', maxHeight: 168, overflowY: 'auto' }}>
                  {items.map((it, i) => {
                    const on = checked.has(it.id);
                    return (
                      <label key={it.id} title={it.ok ? undefined : "The wallet can't cover this offer on top of the ones above it."}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', fontSize: 12.5, borderTop: i ? '1px solid var(--line)' : undefined, opacity: on ? 1 : 0.55, cursor: busy ? 'default' : 'pointer' }}>
                        <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(it.id)}
                          style={{ accentColor: 'var(--accent)', width: 14, height: 14, flex: '0 0 auto', cursor: busy ? 'default' : 'pointer' }} />
                        <span className="zs-num" style={{ color: 'var(--ink)' }}>{it.pay}</span>
                        <Icon.arrow style={{ color: 'var(--ink-3)', width: 12, height: 12 }} />
                        <span className="zs-num" style={{ color: 'var(--accent)' }}>{it.receive}</span>
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {it.mine && <span className="zs-pill" style={{ padding: '1px 6px', fontSize: 9.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }}>Yours</span>}
                          {!it.ok && <span style={{ fontSize: 11, color: 'var(--neg)', fontWeight: 600 }}>can't afford</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {(err ?? view.blocked) && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--neg)', lineHeight: 1.45, wordBreak: 'break-word' }}>{err ?? view.blocked}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="zs-btn" style={{ flex: '0 0 auto', padding: '12px 16px' }} disabled={busy} onClick={onClose}>Cancel</button>
              {(() => {
                const stop = !!view.blocked || nothingChecked;
                return (
                  <button className="zs-btn zs-btn--primary" style={{ flex: 1, justifyContent: 'center', padding: 12, opacity: stop ? 0.5 : 1, cursor: stop ? 'not-allowed' : 'pointer' }} disabled={busy || stop} onClick={() => run(view.cta)}>
                    {busy ? 'Settling…' : <><Icon.bolt /> {view.cta}</>}
                  </button>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
