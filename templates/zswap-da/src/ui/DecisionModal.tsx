// Generic "which of these do you want?" dialog. Unlike ConfirmModal it runs no
// async action and reports no error: it only asks, hands the answer back and
// closes — the flow that opened it decides what happens next.
//
// It exists because the take path had nowhere to ask. When the selection turned
// out to contain your own offers the only reachable branch was the connect
// modal, which explained nothing and settled nothing (issue 00003).

import { Modal, ModalHead } from './Modal';

export interface DecisionOption {
  label: string;
  /** `primary` is the accented CTA, `plain` the neutral button. At most one
   *  primary — the dialog does not enforce it, the callers just don't. */
  kind?: 'primary' | 'plain';
  onPick: () => void;
}

export interface DecisionPayload {
  title: string;
  body: string;
  options: DecisionOption[];
}

export function DecisionModal({ payload, onClose }: { payload: DecisionPayload | null; onClose: () => void }) {
  return (
    <Modal open={!!payload} onClose={onClose} width={420}>
      {payload && (
        <>
          <ModalHead title={payload.title} onClose={onClose} />
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>{payload.body}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {payload.options.map((opt, i) => (
                <button
                  key={i}
                  className={opt.kind === 'primary' ? 'zs-btn zs-btn--primary' : 'zs-btn'}
                  style={opt.kind === 'primary'
                    ? { flex: 1, minWidth: 120, justifyContent: 'center', padding: 12 }
                    : { flex: '0 0 auto', padding: '12px 16px' }}
                  // Close first: every option ends this question, and the
                  // handler may open the next dialog on top of it.
                  onClick={() => { onClose(); opt.onPick(); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
