import React, { useEffect, useState } from "react";
import { useWallet } from "../wallet/WalletContext.tsx";
import { useLog } from "../logs/LogContext.tsx";

type ItemInfo = {
  id: number;
  name: string;
};

type PurchasedItem = {
  item_id: number;
  quantity: number;
};

export function MyPurchases({
  slug,
  apiUrl,
  items,
  refreshKey,
  localPurchases,
}: {
  slug: string;
  apiUrl: string;
  items: ItemInfo[];
  refreshKey: number;
  localPurchases?: Record<number, number>;
}) {
  const w = useWallet();
  const { addLog } = useLog();
  const [serverPurchases, setServerPurchases] = useState<PurchasedItem[]>([]);

  const address = w.mode.startsWith("evm") ? w.evmAddress : w.cardanoAddress;

  useEffect(() => {
    if (!address || w.mode === "none") {
      setServerPurchases([]);
      return;
    }
    addLog("info", "Fetching your purchases...", `GET /api/userData/${slug}?wallet=${address.substring(0, 16)}...`);
    fetch(`${apiUrl}/api/userData/${slug}?wallet=${address}`)
      .then((r) => r.json())
      .then((d: any) => {
        const userItems = (d.items || []).filter((i: PurchasedItem) => i.quantity > 0);
        setServerPurchases(userItems);
        if (userItems.length > 0) {
          addLog("success", `You own ${userItems.length} item type(s)`);
        }
      })
      .catch(() => {});
  }, [address, slug, apiUrl, refreshKey, w.mode]);

  const merged = new Map<number, number>();
  for (const p of serverPurchases) {
    merged.set(p.item_id, (merged.get(p.item_id) || 0) + p.quantity);
  }
  if (localPurchases) {
    for (const [id, qty] of Object.entries(localPurchases)) {
      const numId = Number(id);
      if (!merged.has(numId)) {
        merged.set(numId, qty);
      }
    }
  }

  const purchased = Array.from(merged.entries())
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ item_id: id, quantity: qty }));

  if (w.mode === "none" || purchased.length === 0) return null;

  return (
    <div data-testid="my-purchases" style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, marginBottom: 16, color: "#c9d1d9" }}>My Purchases</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {purchased.map((p) => {
          const info = items.find((i) => i.id === p.item_id);
          return (
            <div key={p.item_id} style={{
              border: "1px solid #21262d", borderRadius: 8, padding: 12,
              background: "#0d1117", textAlign: "center",
            }}>
              <p style={{ fontSize: 13, color: "#e6edf3", fontWeight: 600 }}>{info?.name || `Item #${p.item_id}`}</p>
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 6, fontSize: 12 }}>
                <span style={{ color: "#8b949e" }}>ID <span style={{ color: "#c9d1d9", fontFamily: "monospace" }}>{p.item_id}</span></span>
                <span style={{ color: "#3fb950" }}>Owned: {p.quantity}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
