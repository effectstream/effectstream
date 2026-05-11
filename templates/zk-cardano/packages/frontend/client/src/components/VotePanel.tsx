import React, { useState } from "react";
import { castVote, createProposal } from "../midnight-api.ts";

interface Props {
  contractJoined: boolean;
  onLog: (msg: string) => void;
  votedProposals: Set<number>;
  setVotedProposals: React.Dispatch<React.SetStateAction<Set<number>>>;
}

function VotePanel({ contractJoined, onLog, votedProposals, setVotedProposals }: Props) {
  const [proposalId, setProposalId] = useState("1");
  const [proposalTitle, setProposalTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentId = Number(proposalId);
  const alreadyVoted = votedProposals.has(currentId);

  const handleVote = async (voteYes: boolean) => {
    setSubmitting(true);
    try {
      onLog(`Casting ${voteYes ? "YES" : "NO"} vote on proposal ${proposalId}...`);
      const result = await castVote(Number(proposalId), voteYes);
      setVotedProposals(prev => new Set([...prev, currentId]));
      onLog(`Vote submitted! TX: ${result.txId}`);
    } catch (e: any) {
      if (e.message?.includes("already voted")) {
        setVotedProposals(prev => new Set([...prev, currentId]));
        onLog(`Already voted on proposal ${proposalId}. Each wallet can only vote once per proposal.`);
      } else {
        onLog(`Vote failed: ${e.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProposal = async () => {
    if (!proposalTitle.trim()) return;
    setSubmitting(true);
    try {
      onLog(`Creating proposal: "${proposalTitle}"...`);
      const result = await createProposal(proposalTitle.trim());
      onLog(`Proposal created! TX: ${result.txId}`);
      setProposalTitle("");
    } catch (e: any) {
      onLog(`Create proposal failed: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!contractJoined) {
    return (
      <div className="card" data-testid="vote-card">
        <h2>Vote</h2>
        <p>Connect wallet and join contract to vote.</p>
      </div>
    );
  }

  return (
    <div className="card" data-testid="vote-card">
      <h2>Vote</h2>

      <div style={{ marginBottom: "1.25em" }}>
        <div className="section-header">
          <label style={{ fontSize: "0.875em", fontWeight: 500, color: "#374151" }}>New Proposal</label>
        </div>
        <div style={{ display: "flex", gap: "0.5em" }}>
          <input
            type="text"
            value={proposalTitle}
            onChange={(e) => setProposalTitle(e.target.value)}
            placeholder="Proposal title / description"
            data-testid="proposal-title-input"
          />
          <button
            className="primary"
            onClick={handleCreateProposal}
            disabled={submitting || !proposalTitle.trim()}
            data-testid="create-proposal-btn"
          >
            Create
          </button>
        </div>
      </div>

      <div>
        <div className="section-header">
          <label style={{ fontSize: "0.875em", fontWeight: 500, color: "#374151" }}>Cast Vote</label>
        </div>
        <div style={{ display: "flex", gap: "0.5em", alignItems: "center" }}>
          <label style={{ fontSize: "0.875em", color: "#6b7280" }}>Proposal ID:</label>
          <input
            type="number"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            style={{ width: "80px" }}
            min="1"
            data-testid="proposal-id-input"
          />
          <button
            className="success"
            onClick={() => handleVote(true)}
            disabled={submitting || alreadyVoted}
            data-testid="vote-yes-btn"
          >
            Yes
          </button>
          <button
            className="danger"
            onClick={() => handleVote(false)}
            disabled={submitting || alreadyVoted}
            data-testid="vote-no-btn"
          >
            No
          </button>
          {alreadyVoted && <span className="badge badge-active">Voted</span>}
        </div>
      </div>

      {submitting && <p style={{ marginTop: "0.75em" }}>Submitting transaction (ZK proof generation may take a moment)...</p>}
    </div>
  );
}

export default VotePanel;
