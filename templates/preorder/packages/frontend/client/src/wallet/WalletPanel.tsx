import React, { useState } from "react";
import { useWallet } from "./WalletContext.tsx";
import { buyItemsNative, buyItemsErc20, getErc20Balance } from "./evm-wallet.ts";
import { sendPayment, getBalance } from "./cardano-wallet.ts";
import { WalletConfirmModal } from "./WalletConfirmModal.tsx";
import { PurchaseSuccessPopup } from "./PurchaseSuccessPopup.tsx";
import { useLog } from "../logs/LogContext.tsx";
import { ETH_TO_ADA_RATE, ZERO_ADDRESS, MOCK_USDC_ADDRESS } from "../config.ts";
import type { Address } from "viem";

type ItemInfo = {
  id: number;
  name: string;
  prices?: Record<string, string>;
};

interface Props {
  launchpadAddress: string;
  cardanoPaymentAddress?: string;
  cart: Record<number, number>;
  totalCostWei: bigint;
  selectedToken?: string;
  items: ItemInfo[];
  onPurchaseComplete?: (purchasedCart?: Record<number, number>) => void;
  onClearCart?: () => void;
}

export function WalletPanel({
  launchpadAddress,
  cardanoPaymentAddress,
  cart,
  totalCostWei,
  selectedToken,
  items,
  onPurchaseComplete,
  onClearCart,
}: Props) {
  const w = useWallet();
  const { addLog } = useLog();
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalBalance, setModalBalance] = useState("0");

  const hasItems = Object.keys(cart).length > 0;
  const isEvm = w.mode.startsWith("evm");
  const isDevWallet = w.mode === "evm-local" || w.mode === "cardano-dev";

  const isCardano = !isEvm && w.mode !== "none";
  const tokenAddr = selectedToken || ZERO_ADDRESS;
  const isErc20 = isEvm && tokenAddr !== ZERO_ADDRESS;
  const currencySymbol = isCardano ? "ADA" : isErc20 ? "USDC" : "ETH";
  const rate = isCardano ? ETH_TO_ADA_RATE : 1;
  const decimals = isCardano ? 2 : isErc20 ? 2 : 4;
  const formatDisplay = (wei: number | bigint) => {
    if (isErc20) return (Number(wei) / 1e6).toFixed(2);
    return ((Number(wei) / 1e18) * rate).toFixed(decimals);
  };

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const item = items.find((i) => i.id === Number(id));
    const rawPrice = item?.prices?.[isCardano ? ZERO_ADDRESS : tokenAddr] || "0";
    const divisor = isErc20 ? 1e6 : 1e18;
    const unitPrice = (Number(rawPrice) / divisor) * (isCardano ? ETH_TO_ADA_RATE : 1);
    return {
      id: Number(id),
      name: item?.name || `Item #${id}`,
      quantity: qty,
      price: (unitPrice * qty).toFixed(decimals),
    };
  });

  const handleEvmPurchase = async () => {
    if (!w.evmWalletClient || !w.evmPublicClient || !w.evmAddress) return;
    setPurchasing(true);
    setTxStatus(null);
    const itemIds = Object.keys(cart).map((id) => BigInt(id));
    const quantities = Object.values(cart).map((q) => BigInt(q));
    const itemSummary = Object.entries(cart).map(([id, q]) => `item#${id} x${q}`).join(", ");
    const referrer = ZERO_ADDRESS as Address;
    try {
      let result: { txHash: string };
      if (isErc20) {
        addLog("pending", "Submitting ERC20 transaction...", `buyItemsErc20(${itemSummary}) | ${formatDisplay(totalCostWei)} USDC`);
        addLog("chain", "approve → buyItemsErc20 → PaimaLaunchpad", `token: ${tokenAddr}`);
        result = await buyItemsErc20(
          w.evmWalletClient, w.evmPublicClient,
          launchpadAddress as Address, tokenAddr as Address, totalCostWei,
          w.evmAddress as Address, referrer, itemIds, quantities,
        );
      } else {
        addLog("pending", "Submitting EVM transaction...", `buyItemsNative(${itemSummary}) | value: ${(Number(totalCostWei) / 1e18).toFixed(4)} ETH`);
        addLog("chain", "writeContract → PaimaLaunchpad", `to: ${launchpadAddress}`);
        result = await buyItemsNative(
          w.evmWalletClient, w.evmPublicClient,
          launchpadAddress as Address, w.evmAddress as Address,
          referrer, itemIds, quantities, totalCostWei,
        );
      }
      addLog("success", "EVM transaction confirmed", `txHash: ${result.txHash}`);
      addLog("chain", "waitForTransactionReceipt OK", "Block included, receipt received");
      setTxStatus(`TX: ${result.txHash}`);
      onPurchaseComplete?.(cart);
      onClearCart?.();
    } catch (e: any) {
      addLog("error", "EVM transaction failed", e.message);
      setTxStatus(`Error: ${e.message}`);
    } finally {
      setPurchasing(false);
    }
  };

  const handleCardanoPurchase = async () => {
    if (!w.cardanoLucid || !w.cardanoAddress || !cardanoPaymentAddress) return;
    setPurchasing(true);
    setTxStatus(null);
    const lovelace = (totalCostWei * BigInt(ETH_TO_ADA_RATE)) / 1_000_000_000_000n;
    const cartItems = Object.entries(cart).map(([id, qty]) => ({ id: Number(id), qty }));
    addLog("pending", "Building Cardano transaction...", `sendPayment(${lovelace} lovelace) → ${cardanoPaymentAddress.substring(0, 30)}...`);
    addLog("chain", "Lucid tx.payToAddress → sign → submit (client-side)", `items: ${JSON.stringify(cartItems)}`);
    try {
      const result = await sendPayment(w.cardanoLucid, cardanoPaymentAddress, lovelace, w.cardanoAddress, cartItems);
      addLog("success", "Cardano TX submitted to YACI node", `txHash: ${result.txHash}`);
      addLog("chain", "Awaiting block confirmation via Dolos sync...");
      setTxStatus(`TX: ${result.txHash}`);
      onPurchaseComplete?.(cart);
      onClearCart?.();
    } catch (e: any) {
      addLog("error", "Cardano transaction failed", e.message);
      setTxStatus(`Error: ${e.message}`);
    } finally {
      setPurchasing(false);
    }
  };

  const handlePurchaseClick = async () => {
    if (!isDevWallet) {
      if (isEvm) return handleEvmPurchase();
      return handleCardanoPurchase();
    }

    addLog("info", "Fetching wallet balance for confirmation...");
    try {
      let balanceDisplay: string;
      if (isEvm && w.evmPublicClient && w.evmAddress) {
        if (isErc20) {
          const bal = await getErc20Balance(w.evmPublicClient, tokenAddr as Address, w.evmAddress as Address);
          balanceDisplay = (Number(bal) / 1e6).toFixed(2);
        } else {
          const bal = await w.evmPublicClient.getBalance({ address: w.evmAddress as Address });
          balanceDisplay = (Number(bal) / 1e18).toFixed(4);
        }
      } else if (w.cardanoLucid && w.cardanoAddress) {
        const bal = await getBalance(w.cardanoLucid, w.cardanoAddress);
        balanceDisplay = (Number(bal) / 1e6).toFixed(2);
      } else {
        balanceDisplay = "0";
      }
      setModalBalance(balanceDisplay);
      setShowModal(true);
    } catch (e: any) {
      addLog("error", "Failed to fetch balance", e.message);
      if (isEvm) return handleEvmPurchase();
      return handleCardanoPurchase();
    }
  };

  const handleModalConfirm = () => {
    setShowModal(false);
    if (isEvm) handleEvmPurchase();
    else handleCardanoPurchase();
  };

  const handleModalReject = () => {
    setShowModal(false);
    addLog("info", "Transaction rejected by user");
  };

  if (w.mode === "none") {
    return (
      <div data-testid="wallet-panel" style={{
        marginTop: 24, padding: 20, border: "1px solid #21262d", borderRadius: 8, background: "#0d1117",
        textAlign: "center",
      }}>
        <p style={{ color: "#8b949e", fontSize: 14 }}>
          Connect a wallet from the header to purchase items
        </p>
      </div>
    );
  }

  return (
    <div data-testid="wallet-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {hasItems && (
          isEvm ? (
            <button data-testid="purchase-button" onClick={handlePurchaseClick} disabled={purchasing}
              style={{
                padding: "10px 28px", cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: purchasing ? "#1a3a2a" : "#238636", border: "1px solid #2ea043",
                borderRadius: 6, color: "#fff",
              }}>
              {purchasing ? "Processing..." : `Buy with ${currencySymbol}`}
            </button>
          ) : (
            <button data-testid="purchase-button" onClick={handlePurchaseClick}
              disabled={purchasing || !cardanoPaymentAddress}
              style={{
                padding: "10px 28px", cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: purchasing ? "#3a1a1a" : "#c63", border: "1px solid #da3633",
                borderRadius: 6, color: "#fff",
              }}>
              {purchasing ? "Processing..." : "Pay with ADA"}
            </button>
          )
        )}
        {txStatus && txStatus.startsWith("Error") && (
          <span data-testid="purchase-status" style={{
            fontSize: 12, fontFamily: "monospace", color: "#f85149",
          }}>
            {txStatus}
          </span>
        )}
      </div>

      {showModal && (
        <WalletConfirmModal
          chain={isEvm ? "evm" : "cardano"}
          items={cartItems}
          totalDisplay={formatDisplay(totalCostWei)}
          recipientAddress={isEvm ? launchpadAddress : (cardanoPaymentAddress || "")}
          balance={modalBalance}
          currencySymbol={currencySymbol}
          onConfirm={handleModalConfirm}
          onReject={handleModalReject}
        />
      )}

      {txStatus && !txStatus.startsWith("Error") && (
        <PurchaseSuccessPopup
          txHash={txStatus.replace("TX: ", "")}
          chain={isEvm ? "evm" : "cardano"}
          onClose={() => { setTxStatus(null); onClearCart?.(); }}
        />
      )}
    </div>
  );
}
