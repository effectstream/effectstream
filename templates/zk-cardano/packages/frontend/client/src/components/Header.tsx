import React, { useState, useEffect } from "react";
import { BLOCK_HEIGHTS_ENDPOINT } from "../config.ts";

function Header() {
  const [blockHeight, setBlockHeight] = useState<number | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(BLOCK_HEIGHTS_ENDPOINT);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const pages = data.map((d: any) => d.fetched_page ?? 0);
            if (pages.length > 0) setBlockHeight(Math.max(...pages));
          }
        }
      } catch {
        // not connected
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header>
      <h1>Private Delegation Voting</h1>
      <p className="subtitle">
        Cardano + Midnight cross-chain ZK voting
        {blockHeight != null && (
          <span style={{ marginLeft: "0.75em", fontSize: "0.85em" }}>
            Block #{blockHeight}
          </span>
        )}
      </p>
    </header>
  );
}

export default Header;
