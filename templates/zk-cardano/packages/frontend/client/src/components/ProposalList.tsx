import React, { useState, useEffect } from "react";
import { BASE_URL_API } from "../config.ts";

interface Proposal {
  id: number;
  title: string | null;
  active: boolean;
  block_height: number;
  yes_count: number;
  no_count: number;
}

interface ContractState {
  proposal_count: number;
  tally_yes: number;
  tally_no: number;
  last_block_height: number;
}

interface Props {
  votedProposals: Set<number>;
}

function ProposalList({ votedProposals }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contractState, setContractState] = useState<ContractState | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const [proposalsRes, stateRes] = await Promise.all([
          fetch(`${BASE_URL_API}/api/proposals`),
          fetch(`${BASE_URL_API}/api/contract-state`),
        ]);
        if (proposalsRes.ok) setProposals(await proposalsRes.json());
        if (stateRes.ok) setContractState(await stateRes.json());
      } catch {
        // not connected
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card" data-testid="proposals-card">
      <h2>Proposals</h2>

      {contractState && (
        <div className="contract-state" data-testid="contract-state">
          On-chain: {contractState.proposal_count} proposal{contractState.proposal_count !== 1 ? "s" : ""}
          {" | "}{contractState.tally_yes} yes
          {" | "}{contractState.tally_no} no
          {contractState.last_block_height > 0 && <> {" | "} Block #{contractState.last_block_height}</>}
        </div>
      )}

      {proposals.length === 0 ? (
        <p data-testid="no-proposals">No proposals yet.</p>
      ) : (
        <table data-testid="proposals-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Yes</th>
              <th>No</th>
              <th>Total</th>
              <th>Block</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id} data-testid={`proposal-row-${p.id}`}>
                <td>{p.id}</td>
                <td>{p.title || "—"}</td>
                <td>
                  <span className={`badge ${p.active ? "badge-active" : "badge-closed"}`}>
                    {p.active ? "Active" : "Closed"}
                  </span>
                  {votedProposals.has(p.id) && (
                    <span className="badge badge-voted" style={{ marginLeft: "0.25em" }}>Voted</span>
                  )}
                </td>
                <td>{p.yes_count}</td>
                <td>{p.no_count}</td>
                <td>{p.yes_count + p.no_count}</td>
                <td>{p.block_height}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ProposalList;
