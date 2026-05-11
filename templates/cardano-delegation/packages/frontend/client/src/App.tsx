import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  API_BASE,
  POLL_INTERVAL_MS,
} from "./config.ts";
import {
  createWallet as createCardanoWallet,
  fundWallet,
  delegateWallet,
  refreshBalance,
  fetchDelegationHistory,
  type WalletState,
} from "./wallet/cardano-wallet.ts";
import { PoolInfo } from "./components/PoolInfo.tsx";
import { WalletList } from "./components/WalletList.tsx";
import { DelegationsTable } from "./components/DelegationsTable.tsx";
import { DevInfo } from "./components/DevInfo.tsx";

interface DelegationRow {
  id: number;
  block_height: number;
  address: string;
  pool: string;
  epoch: string;
  tx_hash: string | null;
  created_at: string;
}

interface PoolStat {
  pool: string;
  total_delegators: number;
  latest_epoch: string;
  latest_block: number;
}

interface BlockHeight {
  protocol_name: string;
  synced_page: number;
}

export default function App() {
  const [wallets, setWallets] = useState<WalletState[]>([]);
  const [delegations, setDelegations] = useState<DelegationRow[]>([]);
  const [poolStats, setPoolStats] = useState<PoolStat[]>([]);
  const [blockHeights, setBlockHeights] = useState<BlockHeight[]>([]);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevDelegationCount = useRef(0);

  useEffect(() => {
    async function poll() {
      try {
        const [dRes, pRes, bRes] = await Promise.all([
          fetch(`${API_BASE}/delegations?limit=50&offset=0`),
          fetch(`${API_BASE}/pool-stats`),
          fetch(`${API_BASE}/block-heights`),
        ]);
        if (dRes.ok) {
          const newDelegations = await dRes.json();
          if (newDelegations.length > prevDelegationCount.current && prevDelegationCount.current > 0) {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.7 } });
          }
          prevDelegationCount.current = newDelegations.length;
          setDelegations(newDelegations);
        }
        if (pRes.ok) {
          setPoolStats(await pRes.json());
        }
        if (bRes.ok) setBlockHeights(await bRes.json());
      } catch {
        // API not ready yet
      }
    }
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleCreateWallet = useCallback(async () => {
    setCreating(true);
    setStatus("Creating wallet...");
    try {
      const wallet = await createCardanoWallet();
      setWallets((prev) => [...prev, wallet]);
      setStatus(`Wallet #${wallet.id} created: ${wallet.address.slice(0, 20)}...`);
    } catch (e: any) {
      setStatus(`Error creating wallet: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }, []);

  const handleFundWallet = useCallback(async (walletId: number) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, funding: true } : w)),
    );
    setStatus(`Funding wallet #${walletId}...`);
    try {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) return;
      await fundWallet(wallet, 1000);
      setWallets((prev) =>
        prev.map((w) =>
          w.id === walletId
            ? { ...w, funding: false, balanceAda: wallet.balanceAda }
            : w,
        ),
      );
      setStatus(`Wallet #${walletId} funded: ${wallet.balanceAda} ADA`);
    } catch (e: any) {
      setWallets((prev) =>
        prev.map((w) => (w.id === walletId ? { ...w, funding: false } : w)),
      );
      setStatus(`Error funding wallet: ${e.message}`);
    }
  }, [wallets]);

  const handleDelegateWallet = useCallback(async (walletId: number, poolBech32: string) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, delegating: true } : w)),
    );
    setStatus(`Delegating wallet #${walletId} to ${poolBech32.slice(0, 20)}...`);
    try {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) return;
      const txHash = await delegateWallet(wallet, poolBech32);
      setWallets((prev) =>
        prev.map((w) =>
          w.id === walletId
            ? {
                ...w,
                delegating: false,
                delegated: true,
                delegatedPool: poolBech32,
                balanceAda: wallet.balanceAda,
              }
            : w,
        ),
      );
      setStatus(`Wallet #${walletId} delegated! TX: ${txHash.slice(0, 16)}...`);
    } catch (e: any) {
      setWallets((prev) =>
        prev.map((w) =>
          w.id === walletId ? { ...w, delegating: false } : w,
        ),
      );
      setStatus(`Error delegating: ${e.message}`);
    }
  }, [wallets]);

  const handleCheckDelegation = useCallback(async (walletId: number) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, checkingDelegation: true } : w)),
    );
    setStatus(`Checking indexed delegations for wallet #${walletId}...`);
    try {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) return;
      const history = await fetchDelegationHistory(wallet);
      setWallets((prev) =>
        prev.map((w) =>
          w.id === walletId
            ? { ...w, checkingDelegation: false, delegationHistory: history }
            : w,
        ),
      );
      if (history.length > 0) {
        setStatus(`Wallet #${walletId}: ${history.length} delegation(s) indexed, latest pool ${history[0].pool.slice(0, 16)}...`);
      } else {
        setStatus(`Wallet #${walletId}: no delegations indexed yet`);
      }
    } catch (e: any) {
      setWallets((prev) =>
        prev.map((w) =>
          w.id === walletId ? { ...w, checkingDelegation: false } : w,
        ),
      );
      setStatus(`Error checking delegations: ${e.message}`);
    }
  }, [wallets]);

  return (
    <div style={appStyle}>
      <header style={headerStyle}>
        <h1 data-testid="dashboard-title" style={titleStyle}>
          Cardano Stake Pool Delegation Explorer
        </h1>
        {status && <p style={statusStyle}>{status}</p>}
      </header>

      <PoolInfo allPoolStats={poolStats} />

      <WalletList
        wallets={wallets}
        onCreateWallet={handleCreateWallet}
        onFundWallet={handleFundWallet}
        onDelegateWallet={handleDelegateWallet}
        onCheckDelegation={handleCheckDelegation}
        creating={creating}
      />

      <DelegationsTable delegations={delegations} />

      <DevInfo blockHeights={blockHeights} />
    </div>
  );
}

const appStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "24px 16px",
};

const headerStyle: React.CSSProperties = {
  marginBottom: 24,
};

const titleStyle: React.CSSProperties = {
  color: "#19B17B",
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 8,
};

const statusStyle: React.CSSProperties = {
  color: "#888",
  fontSize: 12,
};
