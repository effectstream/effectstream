import React, { useState, useEffect } from "react";
import { BASE_URL_API } from "../config.ts";

interface Props {
  onLog: (msg: string) => void;
  cardanoStakingCred: string | null;
}

function EligibilityCheck({ onLog, cardanoStakingCred }: Props) {
  const [credential, setCredential] = useState("");
  const [result, setResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (cardanoStakingCred) {
      setCredential(cardanoStakingCred);
      setResult(null);
    }
  }, [cardanoStakingCred]);

  const handleCheck = async () => {
    if (!credential.trim()) return;
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch(`${BASE_URL_API}/api/eligible/${encodeURIComponent(credential.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResult({ eligible: true, ...data });
        onLog(`Eligible: ${credential.trim().slice(0, 20)}...`);
      } else {
        setResult({ eligible: false });
        onLog(`Not eligible: ${credential.trim().slice(0, 20)}...`);
      }
    } catch (e: any) {
      onLog(`Check failed: ${e.message}`);
      setResult({ eligible: false, error: e.message });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="card" data-testid="eligibility-card">
      <h2>Check Eligibility</h2>
      <p>
        {cardanoStakingCred
          ? "Using your connected Cardano wallet's staking credential."
          : "Enter a Cardano staking credential to check if it delegated to the monitored pool."}
      </p>
      <div style={{ display: "flex", gap: "0.5em", marginTop: "0.75em" }}>
        <input
          value={credential}
          onChange={(e) => setCredential(e.target.value)}
          placeholder="Staking credential (hex)"
          data-testid="credential-input"
        />
        <button onClick={handleCheck} disabled={checking || !credential.trim()} data-testid="check-btn">
          {checking ? "..." : "Check"}
        </button>
      </div>
      {result && (
        <p style={{ marginTop: "0.75em" }} data-testid="eligibility-result">
          {result.eligible ? (
            <span className="badge badge-active">
              Eligible — Pool: <span className="mono">{result.pool?.slice(0, 16)}...</span> | Epoch: {result.epoch}
            </span>
          ) : (
            <span className="badge badge-closed">
              Not eligible{result.error ? ` (${result.error})` : ""}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

export default EligibilityCheck;
