import React, { useEffect, useRef, useState } from "react";
import { API_BASE, POLL_INTERVAL_MS, DEFAULT_CARDANO_RECIPIENT } from "./config.ts";
import { getEvmAddress, mintNft } from "./wallet/evm-wallet.ts";
import {
  connectCardanoWallet,
  sendAda,
  faucetTopup,
} from "./wallet/cardano-wallet.ts";
import { ChainStatus } from "./components/ChainStatus.tsx";
import { EventFeed } from "./components/EventFeed.tsx";
import { ActionPanel } from "./components/ActionPanel.tsx";
import { DevInfo } from "./components/DevInfo.tsx";
import { EventsTable } from "./components/EventsTable.tsx";

interface EventRow {
  id: number;
  chain: string;
  event_type: string;
  from_address: string | null;
  to_address: string | null;
  amount: string | null;
  tx_hash: string;
  block_height: number;
}

interface ChainStat {
  chain: string;
  latest_block: number;
  total_events: number;
}

export default function App() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [stats, setStats] = useState<ChainStat[]>([]);
  const [blockHeights, setBlockHeights] = useState<any[]>([]);
  const [erc721Address, setErc721Address] = useState<string | null>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [cardanoAddress, setCardanoAddress] = useState<string | null>(null);
  const [evmConnected, setEvmConnected] = useState(false);
  const [cardanoConnected, setCardanoConnected] = useState(false);
  const [evmConnecting, setEvmConnecting] = useState(false);
  const [cardanoConnecting, setCardanoConnecting] = useState(false);
  const [firstUserBlock, setFirstUserBlock] = useState<number>(Infinity);
  const firstUserBlockRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleConnectEvm() {
    setEvmConnecting(true);
    try {
      const addr = getEvmAddress();
      setEvmAddress(addr);
      setEvmConnected(true);
    } finally {
      setEvmConnecting(false);
    }
  }

  async function handleConnectCardano() {
    setCardanoConnecting(true);
    try {
      const info = await connectCardanoWallet();
      setCardanoAddress(info.address);
      setCardanoConnected(true);
    } catch {
    } finally {
      setCardanoConnecting(false);
    }
  }

  useEffect(() => {
    async function poll() {
      try {
        const [evRes, stRes, bhRes] = await Promise.all([
          fetch(`${API_BASE}/events?limit=50&offset=0`),
          fetch(`${API_BASE}/stats`),
          fetch(`${API_BASE}/block-heights`),
        ]);
        if (evRes.ok) {
          const evts = await evRes.json();
          setEvents(evts);
          if (firstUserBlockRef.current === null && evts.length > 0) {
            const maxBlock = Math.max(...evts.map((e: any) => e.block_height)) + 1;
            firstUserBlockRef.current = maxBlock;
            setFirstUserBlock(maxBlock);
          }
        }
        if (stRes.ok) setStats(await stRes.json());
        if (bhRes.ok) setBlockHeights(await bhRes.json());
      } catch {}
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    async function fetchContract() {
      try {
        const res = await fetch(`${API_BASE}/contract-address`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.address) setErc721Address(data.address);
      } catch {}
    }
    fetchContract();
  }, []);

  async function handleMintNft() {
    if (!erc721Address) throw new Error("ERC721 contract not deployed");
    await mintNft(erc721Address);
  }

  async function handleSendAda(to: string, amount: number) {
    await sendAda(to, amount);
  }

  async function handleFaucet(amount: number) {
    await faucetTopup(amount);
  }

  return (
    <div style={appStyle}>
      <header style={headerStyle}>
        <h1 data-testid="dashboard-title" style={titleStyle}>
          EVM-Cardano Explorer
        </h1>
        <div style={walletBarStyle}>
          {evmConnected ? (
            <span data-testid="evm-address" style={addrChip}>
              EVM: {truncate(evmAddress!)}
            </span>
          ) : (
            <button
              data-testid="connect-evm-btn"
              onClick={handleConnectEvm}
              disabled={evmConnecting}
              style={{ ...connectBtnStyle, borderColor: "#5b9bd5" }}
            >
              {evmConnecting ? "Connecting..." : "Connect EVM Wallet"}
            </button>
          )}
          {cardanoConnected ? (
            <span data-testid="cardano-address" style={addrChip}>
              Cardano: {truncate(cardanoAddress!)}
            </span>
          ) : (
            <button
              data-testid="connect-cardano-btn"
              onClick={handleConnectCardano}
              disabled={cardanoConnecting}
              style={{ ...connectBtnStyle, borderColor: "#b57bdb" }}
            >
              {cardanoConnecting ? "Connecting..." : "Connect Cardano Wallet"}
            </button>
          )}
        </div>
      </header>

      <div style={bodyStyle}>
        <aside style={sidebarStyle}>
          <ChainStatus stats={stats} blockHeights={blockHeights} />
          <DevInfo />
        </aside>

        <main style={mainStyle}>
          <ActionPanel
            erc721Address={erc721Address}
            onMintNft={handleMintNft}
            onSendAda={handleSendAda}
            onFaucet={handleFaucet}
            evmConnected={evmConnected}
            cardanoConnected={cardanoConnected}
            defaultRecipient={DEFAULT_CARDANO_RECIPIENT}
          />
          <div style={feedContainerStyle}>
            <h3 style={feedHeaderStyle}>Event Feed</h3>
            {evmConnected || cardanoConnected ? (
              <EventFeed events={events} firstUserBlock={firstUserBlock} />
            ) : (
              <div style={{ color: "#555", padding: 24, textAlign: "center", fontSize: 13 }}>
                Connect a wallet to see events
              </div>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <EventsTable events={events} />
          </div>
        </main>
      </div>
    </div>
  );
}

function truncate(s: string, len = 20): string {
  if (s.length <= len) return s;
  return s.slice(0, len / 2) + "..." + s.slice(-len / 2);
}

const appStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0a0a",
  color: "#e0e0e0",
  fontFamily: "inherit",
};

const headerStyle: React.CSSProperties = {
  padding: "16px 24px",
  borderBottom: "1px solid #1a1a1a",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#19B17B",
  margin: 0,
};

const walletBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
};

const addrChip: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  background: "#111",
  border: "1px solid #1a1a1a",
  borderRadius: 6,
  padding: "4px 10px",
};

const connectBtnStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#e0e0e0",
  background: "transparent",
  border: "1px solid",
  borderRadius: 6,
  padding: "5px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const bodyStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
  height: "calc(100vh - 57px)",
};

const sidebarStyle: React.CSSProperties = {
  width: 260,
  minWidth: 260,
  padding: 16,
  borderRight: "1px solid #1a1a1a",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  overflowY: "auto",
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
};

const feedContainerStyle: React.CSSProperties = {
  border: "1px solid #1a1a1a",
  borderRadius: 8,
  overflow: "hidden",
};

const feedHeaderStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "12px 16px",
  margin: 0,
  borderBottom: "1px solid #1a1a1a",
  color: "#e0e0e0",
};
