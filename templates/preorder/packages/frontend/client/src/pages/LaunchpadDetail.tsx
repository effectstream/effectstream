import React, { useEffect, useState } from "react";
import { WalletPanel } from "../wallet/WalletPanel.tsx";
import { CountdownTimer } from "../components/CountdownTimer.tsx";
import { MyPurchases } from "../components/MyPurchases.tsx";
import { ItemBanner } from "../components/ItemBanner.tsx";
import { CurrencyToggle } from "../components/CurrencyToggle.tsx";
import { FreeRewardsTimeline } from "../components/FreeRewardsTimeline.tsx";
import { CuratedPackageCard } from "../components/CuratedPackageCard.tsx";
import { OrderFooter } from "../components/OrderFooter.tsx";
import { useWallet } from "../wallet/WalletContext.tsx";
import { useLog } from "../logs/LogContext.tsx";
import { ETH_TO_ADA_RATE, ZERO_ADDRESS, MOCK_USDC_ADDRESS } from "../config.ts";
import { EventManager } from "@effectstream/event-client";
import { AppEvents } from "@preorder/shared/app-events";

type Item = {
  id: number;
  name: string;
  description: string;
  image?: string;
  prices?: Record<string, string>;
  freeAt?: Record<string, string>;
  supply?: number;
  purchased: number;
};

type CuratedPackage = {
  name: string;
  description?: string;
  items: { id: number; quantity: number }[];
};

type LaunchpadDetail = {
  slug: string;
  name: string;
  description: string;
  address: string;
  cardanoPaymentAddress?: string;
  items: Item[];
  curatedPackages?: CuratedPackage[];
  referralDiscountBps?: number;
  referrerRewardBps: number;
};

const SIDEBAR_WIDTH = 360;

const CURRENCIES = [
  { address: ZERO_ADDRESS, symbol: "ETH" },
  { address: MOCK_USDC_ADDRESS, symbol: "USDC" },
];

export function LaunchpadDetail({
  slug,
  apiUrl,
}: {
  slug: string;
  apiUrl: string;
}) {
  const w = useWallet();
  const isCardano = w.mode.startsWith("cardano");
  const isEvm = w.mode.startsWith("evm");

  const [activeCurrency, setActiveCurrency] = useState(ZERO_ADDRESS);
  const activeToken = isCardano ? ZERO_ADDRESS : activeCurrency;

  const isErc20 = isEvm && activeToken !== ZERO_ADDRESS;
  const currencySymbol = isCardano ? "ADA" : isErc20 ? "USDC" : "ETH";
  const rate = isCardano ? ETH_TO_ADA_RATE : 1;

  const formatPrice = (raw: string | number | bigint): string => {
    const val = typeof raw === "string" ? raw : raw.toString();
    if (isErc20) return (Number(val) / 1e6).toFixed(2);
    return ((Number(val) / 1e18) * rate).toFixed(isCardano ? 2 : 4);
  };

  const [data, setData] = useState<LaunchpadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [localPurchases, setLocalPurchases] = useState<Record<number, number>>({});
  const { addLog } = useLog();
  const [lastTx, setLastTx] = useState(false);
  const [priorSpend, setPriorSpend] = useState(0n);
  const [activePackages, setActivePackages] = useState<Set<string>>(new Set());

  const walletAddress = isCardano ? w.cardanoAddress : w.evmAddress;

  useEffect(() => {
    if (!walletAddress || !data) { setPriorSpend(0n); return; }
    fetch(`${apiUrl}/api/userData/${slug}?wallet=${walletAddress}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.user?.total_amount && d.user.payment_token === activeToken) {
          setPriorSpend(BigInt(d.user.total_amount));
        } else {
          setPriorSpend(0n);
        }
      })
      .catch(() => setPriorSpend(0n));
  }, [walletAddress, data, slug, activeToken, refreshKey]);

  useEffect(() => {
    addLog("info", `GET /api/launchpad/${slug}`, "Loading launchpad details + on-chain item counts...");
    fetch(`${apiUrl}/api/launchpad/${slug}`)
      .then((r) => r.json())
      .then((d: any) => {
        setData(d);
        setLoading(false);
        addLog("success", `Loaded "${d.name}" — ${d.items?.length ?? 0} items`, `EVM: ${d.address?.substring(0, 18)}... | Cardano: ${d.cardanoPaymentAddress ? "yes" : "none"}`);
      })
      .catch((e) => {
        setLoading(false);
        addLog("error", "Failed to load launchpad", e.message);
      });
  }, [apiUrl, slug]);

  // Subscribe to PreorderPlaced events for the active wallet on this launchpad.
  //
  // This is the AUTHORITATIVE refresh trigger — it fires after the engine has
  // committed the STF (read-your-writes invariant I1), so every subsequent
  // /api/* fetch is guaranteed to see the new rows. The old "refresh on
  // tx submit" path was racy: it fired the moment the client sent the tx,
  // not when the engine processed it, and frequently rendered stale data.
  //
  // The filter narrows by `buyer` (this wallet) and the current launchpad
  // address; `blockHeight: undefined` matches any block (wildcards via MQTT `+`).
  // For Cardano payments, the launchpad address in the event payload is the
  // EVM address (matchingLaunchpad.address in state-machine.ts), so the same
  // subscription covers both chains for a given launchpad.
  useEffect(() => {
    if (!walletAddress || !data) return;
    let sym: symbol | undefined;
    let cancelled = false;
    EventManager.Instance.subscribe(
      {
        topic: AppEvents.PreorderPlaced,
        filter: {
          buyer: walletAddress.toLowerCase(),
          launchpad: data.address.toLowerCase(),
          blockHeight: undefined,
        },
      },
      (event: any) => {
        addLog(
          event.participationValid ? "success" : "error",
          `PreorderPlaced @ block ${event.blockHeight}`,
          `items=${JSON.stringify(event.itemIds)} qty=${JSON.stringify(event.quantities)} valid=${event.participationValid}`,
        );
        // Authoritative post-COMMIT refresh of (a) per-item purchased counts
        // (via setData) and (b) per-user state (MyPurchases + priorSpend, via
        // refreshKey). One MQTT event drives the whole UI update.
        fetch(`${apiUrl}/api/launchpad/${slug}`)
          .then((r) => r.json())
          .then((d: any) => {
            setData(d);
            setRefreshKey((k) => k + 1);
          })
          .catch((e) => addLog("error", "Refresh after event failed", e.message));
      },
    )
      .then((s) => {
        if (cancelled) {
          EventManager.Instance.unsubscribe(s);
        } else {
          sym = s;
        }
      })
      .catch((err) =>
        addLog("error", "PreorderPlaced subscribe failed", String(err)),
      );
    return () => {
      cancelled = true;
      if (sym) EventManager.Instance.unsubscribe(sym);
    };
  }, [walletAddress, data, apiUrl, slug]);

  const updateCart = (itemId: number, delta: number) => {
    if (delta < 0) setActivePackages(new Set());
    setCart((prev) => {
      const qty = Math.max(0, (prev[itemId] || 0) + delta);
      if (qty === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: qty };
    });
  };

  const togglePackage = (pkg: CuratedPackage) => {
    const name = pkg.name;
    setActivePackages((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        setCart((prevCart) => {
          const updated = { ...prevCart };
          for (const pi of pkg.items) {
            const newQty = (updated[pi.id] || 0) - pi.quantity;
            if (newQty <= 0) delete updated[pi.id];
            else updated[pi.id] = newQty;
          }
          return updated;
        });
      } else {
        next.add(name);
        setCart((prevCart) => {
          const updated = { ...prevCart };
          for (const pi of pkg.items) {
            updated[pi.id] = (updated[pi.id] || 0) + pi.quantity;
          }
          return updated;
        });
      }
      return next;
    });
  };

  const standardItems = data?.items.filter((i) => "prices" in i && i.prices) ?? [];
  const rewardItems = data?.items.filter((i) => "freeAt" in i && i.freeAt) ?? [];

  const totalCost = standardItems.length > 0
    ? Object.entries(cart).reduce((sum, [id, qty]) => {
        const item = standardItems.find((i) => i.id === Number(id));
        if (!item?.prices) return sum;
        const price = BigInt(item.prices[activeToken] || "0");
        return sum + price * BigInt(qty);
      }, 0n)
    : 0n;

  const hasItems = Object.keys(cart).length > 0;

  const handlePurchaseComplete = (purchasedCart?: Record<number, number>) => {
    // Two-layer refresh for the user's own purchase:
    //   1. Optimistic immediate update of `localPurchases` so the cart UI
    //      reflects the purchase before the chain is even mined.
    //   2. Polling refetch of /api/launchpad — repeats up to a few times
    //      because the chain → primitive → STF → COMMIT pipeline takes a
    //      bounded amount of time. We don't know exactly how long.
    //
    // The MQTT subscription below provides a third refresh path for events
    // from OTHER actors (multi-tab, multi-user) and serves as a redundancy
    // signal for the current user. With both paths active, the UI catches
    // up regardless of which one delivers first.
    setLastTx(true);
    if (purchasedCart) {
      setLocalPurchases((prev) => {
        const next = { ...prev };
        for (const [id, qty] of Object.entries(purchasedCart)) {
          next[Number(id)] = (next[Number(id)] || 0) + qty;
        }
        return next;
      });
    }
    addLog("info", "Refreshing launchpad data...", `GET /api/launchpad/${slug}`);
    fetch(`${apiUrl}/api/launchpad/${slug}`)
      .then((r) => r.json())
      .then((d: any) => {
        setData(d);
        setRefreshKey((k) => k + 1);
        addLog("success", "Data refreshed — purchased counts updated");
      });
  };

  if (loading) return <div style={{ padding: 32, color: "#8b949e" }}>Loading...</div>;
  if (!data) return <div style={{ padding: 32, color: "#8b949e" }}>Launchpad not found</div>;

  return (
    <>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px", paddingBottom: (hasItems || lastTx) ? 180 : 64 }}>
        {/* Hero */}
        <div style={{ textAlign: "center", paddingTop: 40, marginBottom: 32 }}>
          <CountdownTimer apiUrl={apiUrl} />
          <h1 data-testid="launchpad-title" style={{
            fontSize: 32, fontWeight: 700, color: "#e6edf3", marginTop: 20, marginBottom: 8,
            letterSpacing: "-0.5px",
          }}>
            {data.name}
          </h1>
          <p style={{ color: "#8b949e", fontSize: 15, maxWidth: 500, margin: "0 auto 16px" }}>
            {data.description}
          </p>

          {/* Currency toggle — only for EVM wallets or when not connected */}
          {!isCardano && (
            <div style={{ marginBottom: 16 }}>
              <CurrencyToggle
                currencies={CURRENCIES}
                active={activeCurrency}
                onChange={setActiveCurrency}
              />
            </div>
          )}

          <div style={{
            display: "inline-flex", gap: 12, fontSize: 11, fontFamily: "monospace", color: "#484f58",
            background: "#0d1117", padding: "6px 14px", borderRadius: 6, border: "1px solid #21262d",
          }}>
            <span>EVM: {data.address.substring(0, 10)}...{data.address.substring(data.address.length - 6)}</span>
            {data.cardanoPaymentAddress && (
              <span>Cardano: {data.cardanoPaymentAddress.substring(0, 16)}...</span>
            )}
          </div>
        </div>

        {/* Free Rewards Timeline */}
        {rewardItems.length > 0 && (
          <FreeRewardsTimeline
            rewards={rewardItems as { id: number; name: string; description: string; freeAt: Record<string, string> }[]}
            activeToken={activeToken}
            currentSpend={totalCost + priorSpend}
            formatPrice={formatPrice}
            currencySymbol={currencySymbol}
          />
        )}

        {/* Curated Packages */}
        {data.curatedPackages && data.curatedPackages.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 18, marginBottom: 16, color: "#c9d1d9" }}>Curated Packages</h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(data.curatedPackages.length, 4)}, 1fr)`,
              gap: 16,
            }}>
              {data.curatedPackages.map((pkg) => (
                <CuratedPackageCard
                  key={pkg.name}
                  pkg={pkg}
                  activeToken={activeToken}
                  items={standardItems}
                  formatPrice={formatPrice}
                  currencySymbol={currencySymbol}
                  isActive={activePackages.has(pkg.name)}
                  onToggle={() => togglePackage(pkg)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Items Grid — 4 columns */}
        <h2 style={{ fontSize: 18, marginBottom: 16, color: "#c9d1d9" }}>Items for Sale</h2>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
        }}>
          {standardItems.map((item) => (
            <div key={item.id} data-testid="item-card" style={{
              border: "1px solid #2a2a2a", borderRadius: 12, overflow: "hidden",
              background: "#111", transition: "border-color 0.2s",
              position: "relative",
            }}>
              {item.supply !== undefined && (
                <div style={{
                  position: "absolute", top: 12, right: -28, zIndex: 2,
                  background: "#d29922", color: "#000", fontSize: 8, fontWeight: 800,
                  padding: "2px 36px", letterSpacing: "1px",
                  transform: "rotate(35deg)",
                  textTransform: "uppercase",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  pointerEvents: "none",
                }}>
                  Limited
                </div>
              )}
              <ItemBanner itemId={item.id} text={item.name} />
              <div style={{ padding: 12 }}>
                <h3 style={{ fontSize: 13, color: "#e6edf3", marginBottom: 4 }}>{item.name}</h3>
                <p style={{ color: "#6e7681", fontSize: 11, marginBottom: 8, lineHeight: 1.4, minHeight: 30 }}>
                  {item.description}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#19B17B", fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>
                      {item.prices ? formatPrice(item.prices[activeToken] || "0") : "0"} {currencySymbol}
                    </span>
                    {item.supply !== undefined && (
                      <span style={{ color: "#d29922", fontSize: 10, marginLeft: 6 }}>
                        {item.purchased}/{item.supply}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <button data-testid={`item-${item.id}-minus`} onClick={() => updateCart(item.id, -1)}
                      style={{ ...qtyBtnStyle }}>-</button>
                    <span data-testid={`item-${item.id}-qty`} style={{
                      width: 28, textAlign: "center", fontSize: 13, color: "#e6edf3",
                      fontFamily: "monospace",
                    }}>
                      {cart[item.id] || 0}
                    </span>
                    <button data-testid={`item-${item.id}-plus`} onClick={() => updateCart(item.id, 1)}
                      style={{ ...qtyBtnStyle }}>+</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* My purchases */}
        <MyPurchases
          slug={slug}
          apiUrl={apiUrl}
          items={data.items.map((i) => ({ id: i.id, name: i.name }))}
          refreshKey={refreshKey}
          localPurchases={localPurchases}
        />
      </div>

      {/* Sticky footer — structured order */}
      {(hasItems || lastTx) && (
        <OrderFooter
          launchpadAddress={data.address}
          cardanoPaymentAddress={data.cardanoPaymentAddress}
          cart={cart}
          totalCost={totalCost}
          selectedToken={activeToken}
          items={standardItems}
          rewards={rewardItems as { id: number; name: string; freeAt: Record<string, string> }[]}
          formatPrice={formatPrice}
          currencySymbol={currencySymbol}
          onUpdateCart={updateCart}
          onClearCart={() => { setCart({}); setActivePackages(new Set()); }}
          onPurchaseComplete={handlePurchaseComplete}
          sidebarWidth={SIDEBAR_WIDTH}
          forceShow={lastTx}
          priorSpend={priorSpend}
        />
      )}

      {/* WalletPanel when no items and no recent tx — shows "connect wallet" prompt */}
      {!hasItems && !lastTx && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px 64px" }}>
          <WalletPanel
            launchpadAddress={data?.address || ""}
            cardanoPaymentAddress={data?.cardanoPaymentAddress}
            cart={cart}
            totalCostWei={totalCost}
            selectedToken={activeToken}
            items={data?.items || []}
            onPurchaseComplete={handlePurchaseComplete}
            onClearCart={() => setCart({})}
          />
        </div>
      )}
    </>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 26, height: 26, cursor: "pointer", fontSize: 14,
  background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#c9d1d9",
  borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
};
