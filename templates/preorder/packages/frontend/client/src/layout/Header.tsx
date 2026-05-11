import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "../wallet/WalletContext.tsx";
import { WalletConnectModal } from "../wallet/WalletConnectModal.tsx";

type DetectedWallet = { name: string; icon?: string };

function detectEvmWallets(): DetectedWallet[] {
  const w = window as any;
  if (!w.ethereum) return [];
  if (w.ethereum.providers && Array.isArray(w.ethereum.providers)) {
    return w.ethereum.providers.map((p: any) => ({
      name: p.isMetaMask ? "MetaMask" : p.isCoinbaseWallet ? "Coinbase" : p.isRabby ? "Rabby" : "EVM Wallet",
      icon: p.icon,
    }));
  }
  if (w.ethereum.isMetaMask) return [{ name: "MetaMask" }];
  return [{ name: "Browser Wallet" }];
}

function detectCardanoWallets(): DetectedWallet[] {
  const w = window as any;
  if (!w.cardano) return [];
  const known = ["nami", "eternl", "flint", "typhon", "lace", "gerowallet", "yoroi"];
  const found: DetectedWallet[] = [];
  for (const k of known) {
    if (w.cardano[k]) {
      found.push({ name: w.cardano[k].name || k.charAt(0).toUpperCase() + k.slice(1), icon: w.cardano[k].icon });
    }
  }
  return found;
}

type PendingConnect = {
  chain: "evm" | "cardano";
  walletName: string;
  action: () => void;
};

export function Header() {
  const w = useWallet();
  const isEvm = w.mode.startsWith("evm");
  const address = isEvm ? w.evmAddress : w.cardanoAddress;
  const [openMenu, setOpenMenu] = useState<"evm" | "cardano" | null>(null);
  const [evmWallets, setEvmWallets] = useState<DetectedWallet[]>([]);
  const [cardanoWallets, setCardanoWallets] = useState<DetectedWallet[]>([]);
  const [pending, setPending] = useState<PendingConnect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEvmWallets(detectEvmWallets());
    setCardanoWallets(detectCardanoWallets());
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  const requestConnect = (chain: "evm" | "cardano", walletName: string, action: () => void) => {
    setOpenMenu(null);
    setPending({ chain, walletName, action });
  };

  return (
    <>
      <header data-testid="app-header" style={{
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", background: "#0d1117", borderBottom: "1px solid #21262d",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #19B17B 0%, #0d7a52 100%)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700,
          }}>E</div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3", letterSpacing: "-0.3px" }}>
            Preorder Launchpad
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {w.error && (
            <span data-testid="wallet-error" style={{ color: "#f85149", fontSize: 12, marginRight: 8 }}>{w.error}</span>
          )}

          {w.mode === "none" ? (
            <div ref={menuRef} style={{ display: "flex", gap: 8, position: "relative" }}>
              {/* Connect EVM */}
              <div style={{ position: "relative" }}>
                <button data-testid="connect-evm-btn" onClick={() => setOpenMenu(openMenu === "evm" ? null : "evm")}
                  style={{ ...pillBtnStyle, background: "#1f3a5f", color: "#58a6ff", border: "1px solid #264a78" }}>
                  {w.isConnecting ? "Connecting..." : "Connect EVM"}
                </button>
                {openMenu === "evm" && (
                  <div style={dropdownStyle}>
                    <button data-testid="connect-evm-local" onClick={() => requestConnect("evm", "Local Dev Wallet", w.connectEvmLocal)}
                      disabled={w.isConnecting} style={menuItemStyle}>
                      <span style={{ fontWeight: 600 }}>Local Dev Wallet</span>
                      <span style={hintStyle}>Pre-funded Hardhat account</span>
                    </button>
                    <div style={dividerStyle} />
                    <div style={{ padding: "6px 14px 4px" }}>
                      <span style={{ fontSize: 10, color: "#6e7681", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
                        Browser Wallets
                      </span>
                    </div>
                    {evmWallets.length > 0 ? (
                      evmWallets.map((ew, i) => (
                        <button key={i} data-testid="connect-evm-injected" onClick={() => { w.connectEvmInjected(); setOpenMenu(null); }}
                          disabled={w.isConnecting} style={menuItemStyle}>
                          <span style={{ fontWeight: 600 }}>{ew.name}</span>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: "6px 14px", color: "#484f58", fontSize: 12 }}>
                        No browser wallets detected
                      </div>
                    )}
                    <div style={dividerStyle} />
                    <div style={{ padding: "6px 14px 10px", color: "#6e7681", fontSize: 11, lineHeight: 1.5 }}>
                      Browser wallets must be configured for the local Hardhat network (chain 31337) with a funded account.
                    </div>
                  </div>
                )}
              </div>

              {/* Connect Cardano */}
              <div style={{ position: "relative" }}>
                <button data-testid="connect-cardano-btn" onClick={() => setOpenMenu(openMenu === "cardano" ? null : "cardano")}
                  style={{ ...pillBtnStyle, background: "#5f1f2a", color: "#f97583", border: "1px solid #78263a" }}>
                  {w.isConnecting ? "Connecting..." : "Connect Cardano"}
                </button>
                {openMenu === "cardano" && (
                  <div style={{ ...dropdownStyle, right: 0, left: "auto" }}>
                    <button data-testid="connect-cardano-dev" onClick={() => requestConnect("cardano", "Local Dev Wallet", w.connectCardanoDev)}
                      disabled={w.isConnecting} style={menuItemStyle}>
                      <span style={{ fontWeight: 600 }}>Local Dev Wallet</span>
                      <span style={hintStyle}>Auto-funded YACI devnet wallet</span>
                    </button>
                    <div style={dividerStyle} />
                    <div style={{ padding: "6px 14px 4px" }}>
                      <span style={{ fontSize: 10, color: "#6e7681", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
                        Browser Wallets
                      </span>
                    </div>
                    {cardanoWallets.length > 0 ? (
                      cardanoWallets.map((cw, i) => (
                        <button key={i} data-testid="connect-cardano-extension" onClick={() => { w.connectCardanoExtension(); setOpenMenu(null); }}
                          disabled={w.isConnecting} style={menuItemStyle}>
                          <span style={{ fontWeight: 600 }}>{cw.name}</span>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: "6px 14px", color: "#484f58", fontSize: 12 }}>
                        No browser wallets detected
                      </div>
                    )}
                    <div style={dividerStyle} />
                    <div style={{ padding: "6px 14px 10px", color: "#6e7681", fontSize: 11, lineHeight: 1.5 }}>
                      Cardano browser wallets (Nami, Eternl, etc.) only work on public testnets and mainnet, not local devnets.
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span data-testid="wallet-chain" style={{
                background: isEvm ? "#1f3a5f" : "#5f1f2a",
                color: isEvm ? "#58a6ff" : "#f97583",
                padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
              }}>
                {isEvm ? "EVM" : "Cardano"}
              </span>
              <span data-testid="wallet-address" style={{
                fontFamily: "monospace", fontSize: 12, color: "#8b949e",
                background: "#161b22", padding: "4px 10px", borderRadius: 6, border: "1px solid #21262d",
              }}>
                {address?.substring(0, 8)}...{address?.substring(address!.length - 4)}
              </span>
              <button data-testid="disconnect-wallet" onClick={w.disconnect} style={{
                ...pillBtnStyle, background: "#161b22", color: "#f85149", border: "1px solid #3d1f20",
              }}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      {pending && (
        <WalletConnectModal
          chain={pending.chain}
          site="Preorder Launchpad"
          walletName={pending.walletName}
          onApprove={() => { pending.action(); setPending(null); }}
          onReject={() => setPending(null)}
        />
      )}
    </>
  );
}

const pillBtnStyle: React.CSSProperties = {
  padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 8px)", left: 0,
  background: "#161b22", border: "1px solid #30363d", borderRadius: 10,
  minWidth: 260, zIndex: 100, overflow: "hidden",
  boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
};

const menuItemStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2, width: "100%",
  background: "none", border: "none", padding: "10px 14px",
  cursor: "pointer", textAlign: "left", color: "#c9d1d9", fontSize: 13,
};

const hintStyle: React.CSSProperties = {
  fontSize: 11, color: "#6e7681", fontWeight: 400,
};

const dividerStyle: React.CSSProperties = {
  height: 1, background: "#21262d", margin: "2px 0",
};
