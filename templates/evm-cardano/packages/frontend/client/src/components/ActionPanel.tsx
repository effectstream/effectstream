import React, { useState } from "react";

interface ActionPanelProps {
  erc721Address: string | null;
  onMintNft: () => Promise<void>;
  onSendAda: (to: string, amount: number) => Promise<void>;
  onFaucet: (amount: number) => Promise<void>;
  evmConnected: boolean;
  cardanoConnected: boolean;
  defaultRecipient: string;
}

export function ActionPanel({
  erc721Address,
  onMintNft,
  onSendAda,
  onFaucet,
  evmConnected,
  cardanoConnected,
  defaultRecipient,
}: ActionPanelProps) {
  const [minting, setMinting] = useState(false);
  const [sending, setSending] = useState(false);
  const [fauceting, setFauceting] = useState(false);
  const [evmStatus, setEvmStatus] = useState("");
  const [cardanoStatus, setCardanoStatus] = useState("");
  const [adaAmount, setAdaAmount] = useState("100");
  const [faucetAmount, setFaucetAmount] = useState("1000");
  const [sendTo, setSendTo] = useState(defaultRecipient);
  const [showSendModal, setShowSendModal] = useState(false);

  async function handleMint() {
    if (!erc721Address) return;
    setMinting(true);
    setEvmStatus("");
    try {
      await onMintNft();
      setEvmStatus("NFT minted!");
    } catch (e: any) {
      setEvmStatus(`Mint failed: ${e.message}`);
    } finally {
      setMinting(false);
    }
  }

  async function handleSend() {
    const amt = Number(adaAmount);
    if (!amt || amt <= 0 || !sendTo) return;
    setSending(true);
    setCardanoStatus("");
    try {
      await onSendAda(sendTo, amt);
      setCardanoStatus(`${amt} ADA sent!`);
      setShowSendModal(false);
    } catch (e: any) {
      setCardanoStatus(`Send failed: ${e.message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleFaucet() {
    const amt = Number(faucetAmount);
    if (!amt || amt <= 0) return;
    setFauceting(true);
    setCardanoStatus("");
    try {
      await onFaucet(amt);
      setCardanoStatus(`Faucet: ${amt} ADA received!`);
    } catch (e: any) {
      setCardanoStatus(`Faucet failed: ${e.message}`);
    } finally {
      setFauceting(false);
    }
  }

  if (!evmConnected && !cardanoConnected) {
    return (
      <div style={rowStyle}>
        <div style={{ ...cardStyle, flex: 1, textAlign: "center" }}>
          <span style={hintStyle}>Connect a wallet to get started</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={rowStyle}>
        {evmConnected && (
          <div style={{ ...cardStyle, borderColor: "#5b9bd522" }}>
            <h4 style={cardTitleStyle}>
              <span style={{ ...dot, background: "#5b9bd5" }} />
              EVM
            </h4>
            <button
              data-testid="mint-nft-btn"
              onClick={handleMint}
              disabled={minting || !erc721Address}
              style={{
                ...btnStyle,
                background: "#5b9bd5",
                width: "100%",
                opacity: minting || !erc721Address ? 0.6 : 1,
              }}
            >
              {minting ? "Minting..." : "Mint NFT"}
            </button>
            {evmStatus && (
              <div style={statusStyle(evmStatus)}>{evmStatus}</div>
            )}
          </div>
        )}

        {cardanoConnected && (
          <div style={{ ...cardStyle, borderColor: "#b57bdb22" }}>
            <h4 style={cardTitleStyle}>
              <span style={{ ...dot, background: "#b57bdb" }} />
              Cardano
            </h4>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                data-testid="send-ada-btn"
                onClick={() => setShowSendModal(true)}
                style={{ ...btnStyle, background: "#b57bdb", flex: 1 }}
              >
                Send ADA
              </button>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  data-testid="faucet-amount-input"
                  type="number"
                  min="1"
                  value={faucetAmount}
                  onChange={(e) => setFaucetAmount(e.target.value)}
                  disabled={fauceting}
                  style={inputStyle}
                />
                <button
                  data-testid="faucet-btn"
                  onClick={handleFaucet}
                  disabled={fauceting || !Number(faucetAmount)}
                  style={{
                    ...btnStyle,
                    background: "#444",
                    opacity: fauceting || !Number(faucetAmount) ? 0.6 : 1,
                  }}
                >
                  {fauceting ? "..." : "Faucet"}
                </button>
              </div>
            </div>
            {cardanoStatus && (
              <div style={statusStyle(cardanoStatus)}>{cardanoStatus}</div>
            )}
          </div>
        )}
      </div>

      {showSendModal && (
        <div style={overlayStyle} onClick={() => !sending && setShowSendModal(false)}>
          <div
            data-testid="send-ada-modal"
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#e0e0e0" }}>
                Send ADA
              </h3>
              <button
                onClick={() => !sending && setShowSendModal(false)}
                style={closeBtnStyle}
              >
                ×
              </button>
            </div>

            <label style={labelStyle}>
              Amount (ADA)
              <input
                data-testid="ada-amount-input"
                type="number"
                min="1"
                value={adaAmount}
                onChange={(e) => setAdaAmount(e.target.value)}
                disabled={sending}
                style={modalInputStyle}
              />
            </label>

            <label style={labelStyle}>
              Recipient
              <input
                data-testid="send-to-input"
                type="text"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="addr_test1..."
                disabled={sending}
                style={{ ...modalInputStyle, fontSize: 11 }}
              />
            </label>

            <button
              data-testid="send-ada-confirm-btn"
              onClick={handleSend}
              disabled={sending || !Number(adaAmount) || !sendTo}
              style={{
                ...btnStyle,
                background: "#b57bdb",
                width: "100%",
                padding: "12px 20px",
                opacity: sending || !Number(adaAmount) || !sendTo ? 0.6 : 1,
              }}
            >
              {sending ? "Sending..." : `Send ${adaAmount} ADA`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function statusStyle(text: string): React.CSSProperties {
  return {
    fontSize: 12,
    marginTop: 8,
    color: text.includes("failed") ? "#e55" : "#19B17B",
  };
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  padding: "12px 0",
};

const cardStyle: React.CSSProperties = {
  flex: "0 1 calc(50% - 6px)",
  background: "#111",
  border: "1px solid #1a1a1a",
  borderRadius: 8,
  padding: 16,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#e0e0e0",
  margin: "0 0 12px 0",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  display: "inline-block",
};

const btnStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "10px 16px",
  color: "#fff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
  width: 60,
  padding: "9px 8px",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#e0e0e0",
  textAlign: "right",
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#555",
  fontStyle: "italic",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: "#111",
  border: "1px solid #333",
  borderRadius: 10,
  padding: 24,
  width: 420,
  maxWidth: "90vw",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#666",
  fontSize: 22,
  cursor: "pointer",
  padding: "0 4px",
  lineHeight: 1,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#888",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const modalInputStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  background: "#0a0a0a",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#e0e0e0",
  width: "100%",
  boxSizing: "border-box",
};
