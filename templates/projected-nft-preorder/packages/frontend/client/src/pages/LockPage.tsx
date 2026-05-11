import React, { useEffect, useState } from "react";
import { getLocks, type NftLock } from "../cardano-api.ts";
import { mintTokens, lockNftAtScript, unlockNftFromScript, claimNftFromScript } from "../cardano/transactions.ts";
import { getScriptAddress } from "../cardano/hololocker.ts";
import { cardanoPosixToWallClock } from "../cardano/wallet.ts";
import { decodeAssetName, truncateAddress, truncateHash, statusLabel, formatTimestamp, relativeTime, toHex } from "../utils.ts";
import { randomNftName } from "../name-generator.ts";
import { colors, glass, badge, btn as btnStyle, input as inputStyle, sectionHeader, sectionDesc } from "../styles.ts";
import NftCard from "../components/NftCard.tsx";
import type { WalletState } from "../App.tsx";
import type { LogEntry } from "../components/LogPanel.tsx";
import type { TxRequest } from "../components/TxConfirmModal.tsx";

interface WalletNft {
  policyId: string;
  assetNameHex: string;
  unit: string;
  quantity: bigint;
}

interface Props {
  wallet: WalletState;
  addLog: (msg: string, type?: LogEntry["type"]) => void;
  requestTx: (req: Omit<TxRequest, "onCancel">) => Promise<void>;
}

function deduplicateLocks(locks: NftLock[]): NftLock[] {
  // Step 1: remove exact row duplicates (primitive emits each event twice)
  const seen = new Set<string>();
  const unique = locks.filter((l) => {
    const key = `${l.current_tx_id}:${l.current_output_index ?? ""}:${l.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Step 2: keep only the latest state per NFT (highest block_height wins)
  const latest = new Map<string, NftLock>();
  for (const l of unique) {
    const nftKey = `${l.policy_id}:${l.asset_name}:${l.owner_address}`;
    const existing = latest.get(nftKey);
    if (!existing || l.block_height > existing.block_height) {
      latest.set(nftKey, l);
    }
  }
  return Array.from(latest.values());
}

export default function LockPage({ wallet, addLog, requestTx }: Props) {
  const [rawLocks, setRawLocks] = useState<NftLock[]>([]);
  const [walletNfts, setWalletNfts] = useState<WalletNft[]>([]);
  const [assetName, setAssetName] = useState(randomNftName);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "my">("all");
  const [cardSeeds, setCardSeeds] = useState<[string, string]>(() => [
    Math.random().toString(16).slice(2, 18),
    Math.random().toString(16).slice(2, 18),
  ]);
  const [activeSeed, setActiveSeed] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);

  const locks = deduplicateLocks(rawLocks);

  const fetchLocks = async () => {
    try {
      const result = await getLocks();
      setRawLocks((prev) => {
        const dedupedNew = deduplicateLocks(result);
        const dedupedOld = deduplicateLocks(prev);
        if (dedupedNew.length !== dedupedOld.length) {
          addLog(`Lock events updated: ${dedupedNew.length} total`);
        }
        return result;
      });
    } catch { /* not ready */ }
  };

  const fetchWalletNfts = async () => {
    if (!wallet.walletInfo) return;
    try {
      const utxos = await wallet.walletInfo.lucid.wallet().getUtxos();
      const nftMap = new Map<string, WalletNft>();
      for (const utxo of utxos) {
        for (const [unit, qty] of Object.entries(utxo.assets)) {
          if (unit === "lovelace") continue;
          const existing = nftMap.get(unit);
          if (existing) {
            existing.quantity += qty;
          } else {
            nftMap.set(unit, {
              policyId: unit.slice(0, 56),
              assetNameHex: unit.slice(56),
              unit,
              quantity: qty,
            });
          }
        }
      }
      setWalletNfts(Array.from(nftMap.values()));
    } catch { /* wallet not ready */ }
  };

  useEffect(() => {
    fetchLocks();
    const interval = setInterval(fetchLocks, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!wallet.walletInfo) { setWalletNfts([]); return; }
    fetchWalletNfts();
    const interval = setInterval(fetchWalletNfts, 5000);
    return () => clearInterval(interval);
  }, [wallet.walletInfo]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSeed(prev => {
        const next = prev === 0 ? 1 : 0;
        setCardSeeds(seeds => {
          const copy: [string, string] = [seeds[0], seeds[1]];
          copy[prev] = Math.random().toString(16).slice(2, 18);
          return copy;
        });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const addToast = (msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
  };

  const atScript = locks.filter((l) => l.status === "Lock" || l.status === "Unlocking");

  const isOwner = (lock: NftLock) =>
    wallet.connected &&
    !!wallet.paymentCredential &&
    lock.owner_address.toLowerCase() === wallet.paymentCredential.toLowerCase();

  const filteredAtScript = filter === "my"
    ? atScript.filter(isOwner)
    : atScript;

  const handleMint = async () => {
    if (!wallet.walletInfo || busy) return;
    setBusy(true);
    try {
      const mintName = assetName;
      setAssetName(randomNftName());
      await requestTx({
        operation: "Mint Test NFT",
        details: { "Asset Name": mintName, "Amount": "1" },
        onConfirm: async () => {
          addLog(`Minting "${mintName}"...`);
          const { txHash, policyId } = await mintTokens(wallet.walletInfo!.lucid, mintName);
          addLog(`Minted! TX: ${truncateHash(txHash, 20)}`, "success");
          addLog(`Policy: ${truncateHash(policyId, 20)}`);
          addToast("Minted! Card arriving shortly…");
          await fetchWalletNfts();
        },
      });
    } catch (e: any) {
      if (e.message !== "Cancelled") addLog(`Mint failed: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const handleLock = async (nft: WalletNft) => {
    if (!wallet.walletInfo || busy) return;
    const name = decodeAssetName(nft.assetNameHex);
    setBusy(true);
    try {
      await requestTx({
        operation: "Lock NFT at Hololocker",
        details: {
          "NFT": name !== nft.assetNameHex ? name : truncateHash(nft.assetNameHex, 20),
          "Policy": truncateHash(nft.policyId, 24),
          "Script": truncateAddress(getScriptAddress()),
        },
        onConfirm: async () => {
          addLog(`Locking "${name}" at Hololocker...`);
          const { txHash, scriptAddress } = await lockNftAtScript(wallet.walletInfo!.lucid, nft.unit);
          addLog(`Locked! TX: ${truncateHash(txHash, 20)}`, "success");
          addLog(`Script address: ${truncateAddress(scriptAddress)}`);
          addToast("Locked! Moving to vault…");
          await fetchWalletNfts();
          setTimeout(fetchLocks, 3000);
        },
      });
    } catch (e: any) {
      if (e.message !== "Cancelled") addLog(`Lock failed: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const handleUnlock = async (lock: NftLock) => {
    if (!wallet.walletInfo || busy) return;
    const name = decodeAssetName(lock.asset_name);
    setBusy(true);
    try {
      await requestTx({
        operation: "Request NFT Withdrawal",
        details: {
          "NFT": name !== lock.asset_name ? name : truncateHash(lock.asset_name, 20),
          "Policy": truncateHash(lock.policy_id, 24),
          "TX": truncateHash(lock.current_tx_id, 24),
        },
        onConfirm: async () => {
          addLog("Building unlock TX...");
          const scriptAddress = getScriptAddress();
          const { txHash, forHowLong } = await unlockNftFromScript(
            wallet.walletInfo!.lucid,
            scriptAddress,
            lock.current_tx_id,
            parseInt(lock.current_output_index || "0", 10),
          );
          addLog(`Unlock TX: ${truncateHash(txHash, 20)}`, "success");
          addLog(`Claimable after: ${formatTimestamp(forHowLong.toString())}`);
          addToast("Unlock requested! Updating…");
          await fetchWalletNfts();
          setTimeout(fetchLocks, 3000);
        },
      });
    } catch (e: any) {
      if (e.message !== "Cancelled") addLog(`Unlock failed: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const handleClaim = async (lock: NftLock) => {
    if (!wallet.walletInfo || busy) return;
    const name = decodeAssetName(lock.asset_name);
    setBusy(true);
    try {
      await requestTx({
        operation: "Claim NFT from Script",
        details: {
          "NFT": name !== lock.asset_name ? name : truncateHash(lock.asset_name, 20),
          "TX": truncateHash(lock.current_tx_id, 24),
        },
        onConfirm: async () => {
          addLog("Building claim TX...");
          const scriptAddress = getScriptAddress();
          const { txHash } = await claimNftFromScript(
            wallet.walletInfo!.lucid,
            scriptAddress,
            lock.current_tx_id,
            BigInt(lock.for_how_long!),
          );
          addLog(`Claimed! TX: ${truncateHash(txHash, 20)}`, "success");
          addToast("Claimed! Returning to wallet…");
          await fetchWalletNfts();
          setTimeout(fetchLocks, 3000);
        },
      });
    } catch (e: any) {
      if (e.message !== "Cancelled") addLog(`Claim failed: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const canClaim = (lock: NftLock) => {
    if (!lock.for_how_long) return false;
    const ms = parseInt(lock.for_how_long, 10);
    if (isNaN(ms)) return false;
    return Date.now() > cardanoPosixToWallClock(ms);
  };

  const renderMintCard = () => {
    if (!wallet.connected || !wallet.walletInfo) return null;
    return (
      <div data-testid="mint-card" style={{ position: "relative", width: 180 }}>
        <div style={{
          position: "relative",
          width: 180,
          height: 252,
          overflow: "hidden",
          borderRadius: 12,
          filter: "blur(4px) brightness(0.5)",
          pointerEvents: "none",
        }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              position: "absolute",
              inset: 0,
              opacity: activeSeed === i ? 1 : 0,
              transition: "opacity 2s ease-in-out",
            }}>
              <NftCard assetHex={cardSeeds[i]} name="" />
            </div>
          ))}
        </div>
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 252,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.75rem",
          gap: "0.5rem",
          zIndex: 10,
          borderRadius: 12,
          background: "rgba(6,8,15,0.35)",
        }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 600, color: colors.text }}>
            Mint NFT
          </div>
          <p style={{ fontSize: "0.68rem", color: colors.muted, margin: 0, textAlign: "center", lineHeight: 1.4 }}>
            Create a native asset on devnet
          </p>
          <div style={{ display: "flex", gap: "0.25rem", width: "100%" }}>
            <input
              data-testid="asset-name-input"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              style={{ ...inputStyle, flex: 1, fontSize: "0.72rem", padding: "0.35rem 0.5rem" }}
              placeholder="AssetName"
            />
            <button
              data-testid="randomize-btn"
              onClick={() => setAssetName(randomNftName())}
              title="Random name"
              style={{
                background: "transparent",
                border: `1px solid ${colors.glassBorder}`,
                color: colors.muted,
                borderRadius: 6,
                padding: "0.35rem 0.4rem",
                cursor: "pointer",
                fontSize: "0.8rem",
                lineHeight: 1,
              }}
            >
              ↻
            </button>
          </div>
          <button
            data-testid="mint-btn"
            onClick={handleMint}
            disabled={busy || !assetName}
            style={{
              ...btnStyle(colors.primary),
              fontSize: "0.72rem",
              padding: "0.35rem 0.75rem",
              opacity: busy ? 0.5 : 1,
              width: "100%",
            }}
          >
            Mint NFT
          </button>
        </div>
      </div>
    );
  };

  const renderWalletNftCard = (nft: WalletNft) => {
    const name = decodeAssetName(nft.assetNameHex);

    return (
      <NftCard key={nft.unit} assetHex={nft.unit} name={name}>
        <div data-testid="wallet-nft-card" style={{ fontSize: "0.78rem", color: colors.textDim }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
            <span style={{ color: colors.muted }}>Policy</span>
            <span>{truncateHash(nft.policyId, 18)}</span>
          </div>
          <button
            data-testid="lock-btn"
            onClick={() => handleLock(nft)}
            disabled={busy}
            style={{ ...btnStyle(colors.success), fontSize: "0.72rem", padding: "0.3rem 0.65rem", opacity: busy ? 0.5 : 1, width: "100%", marginTop: "0.3rem" }}
          >
            Lock at Hololocker
          </button>
        </div>
      </NftCard>
    );
  };

  const renderScriptCard = (lock: NftLock) => {
    const st = statusLabel(lock.status);
    const name = decodeAssetName(lock.asset_name);
    const owned = isOwner(lock);
    const unit = `${lock.policy_id}${lock.asset_name}`;

    return (
      <NftCard key={lock.id} assetHex={unit} name={name}>
        <div data-testid="lock-card" style={{ fontSize: "0.75rem", color: colors.textDim }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
            <span style={badge(st.color, st.bg)}>{st.label}</span>
            <span style={{ color: colors.mutedLight, fontSize: "0.68rem" }}>#{lock.block_height}</span>
          </div>
          <div style={{ marginBottom: "0.15rem" }}>
            <span style={{ color: colors.muted }}>Owner </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {truncateAddress(lock.owner_address)}
            </span>
            {owned && <span style={{ color: colors.primary, fontWeight: 600, fontSize: "0.68rem" }}> YOU</span>}
          </div>
          {lock.for_how_long && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
              <span style={{ color: colors.muted }}>Claim</span>
              <span style={{ fontSize: "0.7rem" }}>
                {relativeTime(cardanoPosixToWallClock(parseInt(lock.for_how_long, 10)))}
              </span>
            </div>
          )}

          {owned && wallet.connected && (
            <div style={{ marginTop: "0.35rem" }}>
              {lock.status === "Lock" && (
                <button
                  data-testid="unlock-btn"
                  onClick={() => handleUnlock(lock)}
                  disabled={busy}
                  style={{ ...btnStyle(colors.warning), fontSize: "0.72rem", padding: "0.3rem 0.65rem", opacity: busy ? 0.5 : 1, width: "100%" }}
                >
                  Request Unlock
                </button>
              )}
              {lock.status === "Unlocking" && (
                <button
                  data-testid="claim-btn"
                  onClick={() => handleClaim(lock)}
                  disabled={busy || !canClaim(lock)}
                  style={{
                    ...btnStyle(canClaim(lock) ? colors.success : colors.muted),
                    fontSize: "0.72rem", padding: "0.3rem 0.65rem",
                    opacity: busy || !canClaim(lock) ? 0.5 : 1,
                    cursor: canClaim(lock) ? "pointer" : "not-allowed",
                    width: "100%",
                  }}
                >
                  {canClaim(lock) ? "Claim NFT" : "Time Lock Active"}
                </button>
              )}
            </div>
          )}
        </div>
      </NftCard>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={sectionHeader}>NFT Custody (Hololocker)</h2>
        <p style={sectionDesc}>
          Lock NFTs at the Hololocker Plutus V2 smart contract to prove ownership. All state is
          read from the Cardano blockchain via EffectStream's <code>CardanoProjectedNFT</code> primitive.
          Transactions are built and submitted directly from your browser wallet.
        </p>
      </div>

      {/* Two-column layout: Unlocked | Locked */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Unlocked — NFTs from wallet UTxOs */}
        <div>
          <div style={columnHeader}>
            <span style={{ color: colors.primary }}>Unlocked</span>
            {wallet.connected && <span style={columnCount}>{walletNfts.length} NFTs</span>}
          </div>
          {!wallet.connected ? (
            <p style={emptyCol}>Connect a wallet to see your NFTs.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              {renderMintCard()}
              {walletNfts.map(renderWalletNftCard)}
            </div>
          )}
        </div>

        {/* Locked — indexed locks from EffectStream */}
        <div>
          <div style={columnHeader}>
            <span style={{ color: colors.success }}>Locked</span>
            <span style={columnCount}>{filteredAtScript.length}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.25rem" }}>
              <button
                data-testid="filter-all"
                onClick={() => setFilter("all")}
                style={filterBtn(filter === "all")}
              >
                All
              </button>
              <button
                data-testid="filter-my"
                onClick={() => setFilter("my")}
                disabled={!wallet.connected}
                style={{
                  ...filterBtn(filter === "my"),
                  opacity: wallet.connected ? 1 : 0.4,
                  cursor: wallet.connected ? "pointer" : "not-allowed",
                }}
              >
                My NFTs
              </button>
            </div>
          </div>
          {filteredAtScript.length === 0 ? (
            <p data-testid="no-locks" style={emptyCol}>
              {filter === "my" ? "You have no locked NFTs." : "No locked NFTs yet."}
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              {filteredAtScript.map(renderScriptCard)}
            </div>
          )}
        </div>
      </div>

      {toasts.length > 0 && (
        <div style={{
          position: "fixed",
          bottom: "1.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 900,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          alignItems: "center",
        }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              ...glass,
              padding: "0.6rem 1.25rem",
              fontSize: "0.82rem",
              color: colors.primary,
              fontWeight: 500,
              whiteSpace: "nowrap",
              animation: "toast-in 300ms ease-out",
            }}>
              {t.msg}
            </div>
          ))}
          <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}
    </div>
  );
}

const columnHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.5rem",
  fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem",
  paddingBottom: "0.5rem", borderBottom: `1px solid ${colors.glassBorder}`,
};

const columnCount: React.CSSProperties = {
  fontSize: "0.75rem", color: colors.muted, fontWeight: 400,
};

const emptyCol: React.CSSProperties = {
  color: colors.muted, fontSize: "0.82rem", fontStyle: "italic",
};

const filterBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(59,130,246,0.15)" : "transparent",
  color: active ? colors.primary : colors.muted,
  border: `1px solid ${active ? "rgba(59,130,246,0.35)" : colors.glassBorder}`,
  borderRadius: 4,
  padding: "0.2rem 0.5rem",
  fontSize: "0.72rem",
  fontWeight: 500,
  cursor: "pointer",
});
