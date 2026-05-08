import React, { useEffect, useState } from "react";
import { getLocks, type NftLock } from "../cardano-api.ts";
import { mintTokens, lockNftAtScript, unlockNftFromScript, claimNftFromScript } from "../cardano/transactions.ts";
import { getScriptAddress } from "../cardano/hololocker.ts";
import { cardanoPosixToWallClock } from "../cardano/wallet.ts";
import { decodeAssetName, truncateAddress, truncateHash, statusLabel, formatTimestamp, relativeTime, toHex } from "../utils.ts";
import { randomNftName } from "../name-generator.ts";
import { colors, badge, btn as btnStyle, input as inputStyle, sectionHeader, sectionDesc } from "../styles.ts";
import NewCard from "../components/NewCard.tsx";
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
  const seen = new Set<string>();
  return locks.filter((l) => {
    const key = `${l.current_tx_id}:${l.current_output_index ?? ""}:${l.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function LockPage({ wallet, addLog, requestTx }: Props) {
  const [rawLocks, setRawLocks] = useState<NftLock[]>([]);
  const [walletNfts, setWalletNfts] = useState<WalletNft[]>([]);
  const [assetName, setAssetName] = useState(randomNftName);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "my">("all");

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
      await requestTx({
        operation: "Mint Test NFT",
        details: { "Asset Name": assetName, "Amount": "1" },
        onConfirm: async () => {
          addLog(`Minting "${assetName}"...`);
          const { txHash, policyId } = await mintTokens(wallet.walletInfo!.lucid, assetName);
          addLog(`Minted! TX: ${truncateHash(txHash, 20)}`, "success");
          addLog(`Policy: ${truncateHash(policyId, 20)}`);
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

  const renderWalletNftCard = (nft: WalletNft) => {
    const name = decodeAssetName(nft.assetNameHex);
    const showDecoded = name !== nft.assetNameHex;

    return (
      <NewCard key={nft.unit} id={`wallet-${nft.unit}`}>
        <div data-testid="wallet-nft-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
              {showDecoded ? name : truncateHash(nft.assetNameHex, 20)}
            </span>
            <span style={{ fontSize: "0.72rem", color: colors.muted }}>
              qty: {nft.quantity.toString()}
            </span>
          </div>
          <div style={{ fontSize: "0.82rem", color: colors.textDim, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.2rem 0.75rem", marginBottom: "0.6rem" }}>
            <span style={{ color: colors.muted }}>Policy</span>
            <span>{truncateHash(nft.policyId, 24)}</span>
            {showDecoded && (
              <>
                <span style={{ color: colors.muted }}>Asset (hex)</span>
                <span>{truncateHash(nft.assetNameHex, 24)}</span>
              </>
            )}
          </div>
          <button
            data-testid="lock-btn"
            onClick={() => handleLock(nft)}
            disabled={busy}
            style={{ ...btnStyle(colors.success), fontSize: "0.78rem", padding: "0.35rem 0.75rem", opacity: busy ? 0.5 : 1 }}
          >
            Lock at Hololocker
          </button>
        </div>
      </NewCard>
    );
  };

  const renderScriptCard = (lock: NftLock) => {
    const st = statusLabel(lock.status);
    const name = decodeAssetName(lock.asset_name);
    const showDecoded = name !== lock.asset_name;
    const owned = isOwner(lock);

    return (
      <NewCard key={lock.id} id={`script-${lock.id}`}>
        <div data-testid="lock-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                {showDecoded ? name : truncateHash(lock.asset_name, 20)}
              </span>
              <span style={badge(st.color, st.bg)}>{st.label}</span>
            </div>
            <span style={{ fontSize: "0.75rem", color: colors.mutedLight }}>Block #{lock.block_height}</span>
          </div>

          <div style={{ fontSize: "0.82rem", color: colors.textDim, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.2rem 0.75rem" }}>
            <span style={{ color: colors.muted }}>Owner</span>
            <span>
              {truncateAddress(lock.owner_address)}
              {owned && <span style={{ color: colors.primary, fontWeight: 600, marginLeft: "0.4rem" }}>(YOU)</span>}
            </span>
            <span style={{ color: colors.muted }}>Policy</span>
            <span>{truncateHash(lock.policy_id, 24)}</span>
            <span style={{ color: colors.muted }}>TX</span>
            <span>{truncateHash(lock.current_tx_id, 24)}</span>
            {showDecoded && (
              <>
                <span style={{ color: colors.muted }}>Asset (hex)</span>
                <span>{truncateHash(lock.asset_name, 24)}</span>
              </>
            )}
            {lock.for_how_long && (
              <>
                <span style={{ color: colors.muted }}>Claimable</span>
                <span>
                  {formatTimestamp(cardanoPosixToWallClock(parseInt(lock.for_how_long, 10)))}{" "}
                  <span style={{ color: colors.mutedLight }}>({relativeTime(cardanoPosixToWallClock(parseInt(lock.for_how_long, 10)))})</span>
                </span>
              </>
            )}
          </div>

          {owned && wallet.connected && (
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
              {lock.status === "Lock" && (
                <button
                  data-testid="unlock-btn"
                  onClick={() => handleUnlock(lock)}
                  disabled={busy}
                  style={{ ...btnStyle(colors.warning), fontSize: "0.78rem", padding: "0.35rem 0.75rem", opacity: busy ? 0.5 : 1 }}
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
                    fontSize: "0.78rem", padding: "0.35rem 0.75rem",
                    opacity: busy || !canClaim(lock) ? 0.5 : 1,
                    cursor: canClaim(lock) ? "pointer" : "not-allowed",
                  }}
                >
                  {canClaim(lock) ? "Claim NFT" : "Time Lock Active"}
                </button>
              )}
            </div>
          )}
        </div>
      </NewCard>
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

      {/* Mint — global action */}
      {wallet.connected && wallet.walletInfo && (
        <div data-testid="mint-section" style={{
          background: colors.cardBg, border: `1px solid ${colors.cardBorder}`,
          borderRadius: 8, padding: "1rem", marginBottom: "1.5rem",
        }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: colors.textDim }}>
            Mint Test NFT
          </div>
          <p style={{ fontSize: "0.78rem", color: colors.muted, margin: "0 0 0.75rem" }}>
            Create a native asset on the devnet. The asset name is the on-chain token identifier (e.g. "PreOrderNFT").
          </p>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: "0.75rem", color: colors.muted, display: "block", marginBottom: "0.3rem" }}>
                Asset Name
              </label>
              <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                <input
                  data-testid="asset-name-input"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  style={{ ...inputStyle, width: 180 }}
                  placeholder="AssetName"
                />
                <button
                  data-testid="randomize-btn"
                  onClick={() => setAssetName(randomNftName())}
                  title="Random name"
                  style={{
                    background: "transparent", border: `1px solid ${colors.cardBorder}`,
                    color: colors.muted, borderRadius: 6, padding: "0.45rem 0.5rem",
                    cursor: "pointer", fontSize: "0.85rem", lineHeight: 1,
                  }}
                >
                  ↻
                </button>
              </div>
            </div>
            <button
              data-testid="mint-btn"
              onClick={handleMint}
              disabled={busy || !assetName}
              style={{ ...btnStyle(colors.primary), opacity: busy ? 0.5 : 1 }}
            >
              Mint NFT
            </button>
          </div>
        </div>
      )}

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
          ) : walletNfts.length === 0 ? (
            <p style={emptyCol}>No unlocked NFTs in your wallet. Mint one above to get started.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {filteredAtScript.map(renderScriptCard)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const columnHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.5rem",
  fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem",
  paddingBottom: "0.5rem", borderBottom: `1px solid ${colors.cardBorder}`,
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
  border: `1px solid ${active ? colors.primary : colors.cardBorder}`,
  borderRadius: 4,
  padding: "0.2rem 0.5rem",
  fontSize: "0.72rem",
  fontWeight: 500,
  cursor: "pointer",
});
