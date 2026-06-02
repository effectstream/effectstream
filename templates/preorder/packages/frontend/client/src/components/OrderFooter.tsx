import React from "react";
import { WalletPanel } from "../wallet/WalletPanel.tsx";

type ItemInfo = {
  id: number;
  name: string;
  prices?: Record<string, string>;
};

type RewardItem = {
  id: number;
  name: string;
  freeAt: Record<string, string>;
};

interface Props {
  launchpadAddress: string;
  receiver?: string;
  referrer?: string;
  cardanoPaymentAddress?: string;
  cart: Record<number, number>;
  totalCost: bigint;
  selectedToken: string;
  paymentTokenAddress?: string;
  decimals?: number;
  items: ItemInfo[];
  rewards: RewardItem[];
  formatPrice: (raw: string | number | bigint) => string;
  currencySymbol: string;
  onUpdateCart: (itemId: number, delta: number) => void;
  onClearCart: () => void;
  onPurchaseComplete: (purchasedCart?: Record<number, number>) => void;
  sidebarWidth: number;
  forceShow?: boolean;
  priorSpend?: bigint;
}

export function OrderFooter({
  launchpadAddress,
  receiver,
  referrer,
  cardanoPaymentAddress,
  cart,
  totalCost,
  selectedToken,
  paymentTokenAddress,
  decimals,
  items,
  rewards,
  formatPrice,
  currencySymbol,
  onUpdateCart,
  onClearCart,
  onPurchaseComplete,
  sidebarWidth,
  forceShow,
  priorSpend = 0n,
}: Props) {
  const hasItems = Object.keys(cart).length > 0;
  if (!hasItems && !forceShow) return null;

  const effectiveSpend = totalCost + priorSpend;
  const unlockedRewards = rewards.filter((r) => {
    const threshold = BigInt(r.freeAt[selectedToken] || "0");
    return threshold > 0n && effectiveSpend >= threshold;
  });

  return (
    <div data-testid="order-summary" style={{
      position: "fixed", bottom: 0, left: 0, right: sidebarWidth,
      background: "#0d1117", borderTop: "1px solid #21262d",
      padding: "16px 32px", zIndex: 50,
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 24, alignItems: "start" }}>
          {/* ITEMS column */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#6e7681",
              textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8,
            }}>
              Items
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(cart).map(([id, qty]) => {
                const item = items.find((i) => i.id === Number(id));
                const rawPrice = item?.prices?.[selectedToken] || "0";
                const lineTotal = BigInt(rawPrice) * BigInt(qty);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ color: "#c9d1d9", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item?.name || `Item #${id}`}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <button onClick={() => onUpdateCart(Number(id), -1)} style={tinyBtnStyle}>-</button>
                      <span style={{ width: 24, textAlign: "center", color: "#e6edf3", fontFamily: "monospace", fontSize: 12 }}>
                        {qty}
                      </span>
                      <button onClick={() => onUpdateCart(Number(id), 1)} style={tinyBtnStyle}>+</button>
                      <button onClick={() => onUpdateCart(Number(id), -qty)} style={{ ...tinyBtnStyle, color: "#f85149", borderColor: "#3d1f20", marginLeft: 2 }}>x</button>
                    </div>
                    <span style={{ color: "#6e7681", fontFamily: "monospace", fontSize: 12, width: 80, textAlign: "right" }}>
                      {formatPrice(lineTotal.toString())} {currencySymbol}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* REWARDS column */}
          {unlockedRewards.length > 0 && (
            <div style={{ minWidth: 140 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#6e7681",
                textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8,
              }}>
                Free Rewards
              </div>
              {unlockedRewards.map((r) => (
                <div key={r.id} style={{ fontSize: 12, color: "#19B17B", marginBottom: 4 }}>
                  {r.name}
                </div>
              ))}
            </div>
          )}

          {/* SUMMARY box */}
          <div style={{
            border: "1px solid #21262d", borderRadius: 10, padding: "12px 16px",
            background: "#161b22", minWidth: 200,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: "#6e7681" }}>Items total</span>
              <span style={{ color: "#c9d1d9", fontFamily: "monospace" }}>
                {formatPrice(totalCost.toString())} {currencySymbol}
              </span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              paddingTop: 8, borderTop: "1px solid #21262d", marginTop: 4,
            }}>
              <span style={{ color: "#e6edf3", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>Balance to pay</span>
              <span style={{ color: "#19B17B", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>
                {formatPrice(totalCost.toString())} {currencySymbol}
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              <WalletPanel
                launchpadAddress={launchpadAddress}
                receiver={receiver}
                referrer={referrer}
                cardanoPaymentAddress={cardanoPaymentAddress}
                cart={cart}
                totalCostWei={totalCost}
                selectedToken={selectedToken}
                paymentTokenAddress={paymentTokenAddress}
                decimals={decimals}
                items={items}
                onPurchaseComplete={onPurchaseComplete}
                onClearCart={onClearCart}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const tinyBtnStyle: React.CSSProperties = {
  width: 20, height: 20, cursor: "pointer", fontSize: 12,
  background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9",
  borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0,
};
