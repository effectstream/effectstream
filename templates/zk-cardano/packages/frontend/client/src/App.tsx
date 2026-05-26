import React, { useState, useCallback } from "react";
import Header from "./components/Header.tsx";
import EligibilityCheck from "./components/EligibilityCheck.tsx";
import ProposalList from "./components/ProposalList.tsx";
import VotePanel from "./components/VotePanel.tsx";
import { connectMidnightWallet, connectToContract } from "./midnight-api.ts";
import { connectCardanoWallet, delegateToPool, type CardanoWalletInfo, type CardanoUtxo } from "./cardano-api.ts";

interface LogEntry {
  time: string;
  message: string;
  details?: Record<string, any>;
}

function App() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [contractJoined, setContractJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);

  const [cardanoConnected, setCardanoConnected] = useState(false);
  const [cardanoConnecting, setCardanoConnecting] = useState(false);
  const [cardanoAddress, setCardanoAddress] = useState<string | null>(null);
  const [cardanoStakingCred, setCardanoStakingCred] = useState<string | null>(null);
  const [cardanoSeedPhrase, setCardanoSeedPhrase] = useState<string | null>(null);
  const [cardanoBalanceAda, setCardanoBalanceAda] = useState<number | null>(null);
  const [cardanoUtxoCount, setCardanoUtxoCount] = useState<number>(0);
  const [cardanoUtxos, setCardanoUtxos] = useState<CardanoUtxo[]>([]);
  const [cardanoDelegated, setCardanoDelegated] = useState(false);
  const [cardanoDelegating, setCardanoDelegating] = useState(false);
  const [cardanoDelegationTx, setCardanoDelegationTx] = useState<string | null>(null);
  const [cardanoPoolId, setCardanoPoolId] = useState<string | null>(null);

  const [votedProposals, setVotedProposals] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = useCallback((msg: string, details?: Record<string, any>) => {
    setLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), message: msg, details }]);
  }, []);
  const addLogSimple = useCallback((msg: string) => addLog(msg), [addLog]);

  const handleCardanoConnect = async () => {
    setCardanoConnecting(true);
    try {
      addLog("Creating Cardano wallet via YACI DevKit...", {
        step: "Generating seed phrase, creating wallet, requesting 10,000 ADA from faucet, waiting for UTxOs",
        faucet_url: "http://localhost:10000/local-cluster/api/addresses/topup",
        provider: "Dolos Blockfrost at http://localhost:3000",
      });
      const result = await connectCardanoWallet();
      setCardanoConnected(true);
      setCardanoAddress(result.address);
      setCardanoStakingCred(result.staking_credential);
      setCardanoSeedPhrase(result.seed_phrase);
      setCardanoBalanceAda(result.balance_ada);
      setCardanoUtxoCount(result.utxo_count);
      setCardanoUtxos(result.utxos);
      addLog("Cardano wallet created and funded", {
        address: result.address,
        staking_credential: result.staking_credential,
        balance: `${result.balance_ada.toLocaleString()} ADA`,
        utxo_count: result.utxo_count,
        seed_phrase: result.seed_phrase,
      });
    } catch (e: any) {
      addLog(`Cardano connect failed: ${e.message}`);
    } finally {
      setCardanoConnecting(false);
    }
  };

  const handleCardanoDelegate = async () => {
    setCardanoDelegating(true);
    try {
      addLog("Building delegation certificate TX...", {
        step: "registerAndDelegate.ToPool(rewardAddress, poolId)",
        pool_bech32: "pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy",
        pool_hash: "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
        action: "Register staking key + delegate to YACI genesis pool",
      });
      const result = await delegateToPool();
      setCardanoDelegated(true);
      setCardanoDelegationTx(result.txHash);
      setCardanoPoolId(result.poolId);
      addLog("Delegation TX confirmed on-chain", {
        tx_hash: result.txHash,
        pool_id: result.poolId,
        note: "Stake becomes active next epoch. Primitives will detect this delegation via UTxO-RPC certificate scanning.",
      });
    } catch (e: any) {
      addLog(`Delegation failed: ${e.message}`);
    } finally {
      setCardanoDelegating(false);
    }
  };

  const handleMidnightConnect = async () => {
    setConnecting(true);
    try {
      addLog("Building Midnight wallet from genesis seed...", {
        seed: "0x0000...0001 (32-byte genesis mint seed)",
        step: "HD key derivation → Zswap + Dust + Unshielded keys",
        network: "undeployed (local Midnight node)",
      });
      const { providers, address } = await connectMidnightWallet();
      setWalletConnected(true);
      setWalletAddress(address);
      addLog("Midnight wallet synced", {
        unshielded_address: address,
        indexer: "http://127.0.0.1:8088/api/v3/graphql",
        proof_server: "http://127.0.0.1:6300",
      });

      addLog("Joining ballot contract...", {
        step: "findDeployedContract() — fetches on-chain contract state via indexer",
      });
      const contract = await connectToContract(providers);
      setContractJoined(true);
      const cAddr = (contract as any)?.deployTxData?.public?.contractAddress;
      if (cAddr) setContractAddress(cAddr);
      addLog("Joined ballot contract", {
        contract_address: cAddr || "unknown",
        circuits: ["create_proposal", "cast_vote", "close_proposal"],
        private_state: "voter secret key (ZK witness)",
      });
    } catch (e: any) {
      addLog(`Error: ${e.message}`);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      <Header />

      {/* ── Cardano Wallet Card ── */}
      <div className="card" data-testid="cardano-wallet-card">
        <h2>Cardano Wallet</h2>
        {!cardanoConnected ? (
          <div>
            <p>Create a Cardano wallet funded by the YACI DevKit faucet.</p>
            <button className="primary" onClick={handleCardanoConnect} disabled={cardanoConnecting} data-testid="cardano-connect-btn">
              {cardanoConnecting ? "Connecting..." : "Connect Cardano Wallet"}
            </button>
          </div>
        ) : (
          <div className="wallet-info">
            <div>
              <div className="label">Address</div>
              <div className="address" data-testid="cardano-address">{cardanoAddress}</div>
            </div>
            <div>
              <div className="label">Staking Credential</div>
              <div className="address" data-testid="cardano-staking-cred">{cardanoStakingCred}</div>
            </div>
            <div className="wallet-internals">
              <div className="label">Wallet Internals</div>
              <div className="internals-grid">
                <span className="internals-key">Balance</span>
                <span className="internals-val">{cardanoBalanceAda?.toLocaleString()} ADA</span>
                <span className="internals-key">UTxOs</span>
                <span className="internals-val">{cardanoUtxoCount}</span>
                <span className="internals-key">Seed Phrase</span>
                <span className="internals-val mono-sm">{cardanoSeedPhrase}</span>
              </div>
              {cardanoUtxos.length > 0 && (
                <details className="utxo-details">
                  <summary>UTxO Set ({cardanoUtxos.length})</summary>
                  <div className="utxo-list">
                    {cardanoUtxos.map((u, i) => (
                      <div key={i} className="utxo-entry">
                        <span className="mono-sm">{u.tx_hash.slice(0, 16)}...#{u.output_index}</span>
                        <span>{(Number(u.lovelace) / 1_000_000).toLocaleString()} ADA</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div style={{ marginTop: "0.5em", display: "flex", gap: "0.5em", alignItems: "center" }}>
              <span className="badge badge-active">Connected</span>
              {cardanoDelegated ? (
                <span className="badge badge-active" data-testid="cardano-delegated-badge">Delegated</span>
              ) : (
                <button className="primary" onClick={handleCardanoDelegate} disabled={cardanoDelegating} data-testid="cardano-delegate-btn">
                  {cardanoDelegating ? "Delegating..." : "Delegate to Pool"}
                </button>
              )}
            </div>
            {cardanoDelegated && cardanoDelegationTx && (
              <div className="wallet-internals" style={{ marginTop: "0.5em" }}>
                <div className="label">Delegation TX</div>
                <div className="internals-grid">
                  <span className="internals-key">TX Hash</span>
                  <span className="internals-val mono-sm">{cardanoDelegationTx}</span>
                  <span className="internals-key">Pool ID</span>
                  <span className="internals-val mono-sm">{cardanoPoolId}</span>
                  <span className="internals-key">Certificate</span>
                  <span className="internals-val">registerAndDelegate.ToPool</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Midnight Wallet Card ── */}
      <div className="card" data-testid="wallet-card">
        <h2>Midnight Wallet</h2>
        {!walletConnected ? (
          <button className="primary" onClick={handleMidnightConnect} disabled={connecting} data-testid="connect-btn">
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        ) : (
          <div className="wallet-info">
            <div>
              <div className="label">Wallet Address</div>
              <div className="address" data-testid="wallet-address">{walletAddress}</div>
            </div>
            {contractAddress && (
              <div>
                <div className="label">Contract Address</div>
                <div className="address" data-testid="contract-address">{contractAddress}</div>
              </div>
            )}
            <div className="wallet-internals">
              <div className="label">Wallet Internals</div>
              <div className="internals-grid">
                <span className="internals-key">Seed</span>
                <span className="internals-val mono-sm">0x00...01 (genesis mint wallet)</span>
                <span className="internals-key">Key Derivation</span>
                <span className="internals-val">HD → account(0) → [Zswap, NightExternal, Dust] → index(0)</span>
                <span className="internals-key">Network</span>
                <span className="internals-val">undeployed (local node at ws://127.0.0.1:9944)</span>
                <span className="internals-key">ZK Circuits</span>
                <span className="internals-val">create_proposal, cast_vote, close_proposal</span>
                <span className="internals-key">Proof Server</span>
                <span className="internals-val">http://127.0.0.1:6300</span>
              </div>
            </div>
            <div style={{ marginTop: "0.25em" }}>
              <span className="badge badge-active">Connected</span>
              {contractJoined && <span className="badge badge-active" style={{ marginLeft: "0.5em" }}>Contract Joined</span>}
            </div>
          </div>
        )}
      </div>

      <EligibilityCheck onLog={addLogSimple} cardanoStakingCred={cardanoStakingCred} />
      <ProposalList votedProposals={votedProposals} />
      <VotePanel contractJoined={contractJoined} onLog={addLogSimple} votedProposals={votedProposals} setVotedProposals={setVotedProposals} />

      {log.length > 0 && (
        <div className="card" data-testid="log-card">
          <h2>Activity Log</h2>
          <div className="log" data-testid="log-output">
            {log.map((entry, i) => (
              <div key={i} className="log-entry">
                <span className="log-time">[{entry.time}]</span> {entry.message}
                {entry.details && (
                  <div className="log-details">
                    {Object.entries(entry.details).map(([k, v]) => (
                      <div key={k} className="log-detail-row">
                        <span className="log-detail-key">{k}:</span> <span className="log-detail-val">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
