import React, { useState } from "react";
import { colors, fonts, btn as btnStyle } from "../styles.ts";

export interface TxRequest {
  operation: string;
  details: Record<string, string>;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  showFee?: boolean;
}

interface Props {
  request: TxRequest;
}

export default function TxConfirmModal({ request }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await request.onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="tx-confirm-modal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.modalOverlay,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: colors.cardBg,
          border: `1px solid ${colors.cardBorder}`,
          borderTop: `3px solid ${colors.primary}`,
          borderRadius: 10,
          padding: "1.5rem",
          width: 400,
          maxWidth: "90vw",
          fontFamily: fonts.sans,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.25rem",
          }}
        >
          <span style={{ fontSize: "1.1rem" }}>{request.operation}</span>
        </div>

        <div
          style={{
            background: "#0c1021",
            borderRadius: 6,
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.85rem",
          }}
        >
          <div
            style={{
              color: colors.primary,
              fontWeight: 600,
              marginBottom: "0.5rem",
              fontSize: "0.9rem",
            }}
          >
            {request.operation}
          </div>
          {Object.entries(request.details).map(([key, value]) => (
            <div
              key={key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.2rem 0",
                gap: "1rem",
              }}
            >
              <span style={{ color: colors.muted, whiteSpace: "nowrap" }}>{key}</span>
              <span
                style={{
                  color: colors.text,
                  textAlign: "right",
                  wordBreak: "break-all",
                  fontFamily: fonts.mono,
                  fontSize: "0.8rem",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {request.showFee !== false && (
          <div
            style={{
              fontSize: "0.8rem",
              color: colors.muted,
              marginBottom: "1.25rem",
              padding: "0.5rem 0.75rem",
              background: "rgba(59,130,246,0.06)",
              borderRadius: 6,
              border: `1px solid rgba(59,130,246,0.15)`,
            }}
          >
            Fee: ~0.2 ADA (estimated)
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={request.onCancel}
            disabled={submitting}
            style={{
              ...btnStyle("transparent"),
              color: colors.muted,
              border: `1px solid ${colors.cardBorder}`,
            }}
          >
            Cancel
          </button>
          <button
            data-testid="tx-confirm-btn"
            onClick={handleConfirm}
            disabled={submitting}
            style={{
              ...btnStyle(colors.primary),
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? "wait" : "pointer",
              minWidth: 100,
            }}
          >
            {submitting ? "Sending..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
