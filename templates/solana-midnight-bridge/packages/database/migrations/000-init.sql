-- One row per bridge transfer, keyed by where it started:
--   direction 's2m': a Solana LOCK, source_id = the program's lock nonce
--   direction 'm2s': a Midnight lockForSolana, source_id = the contract's withdrawal id
-- OWNED BY THE STATE MACHINE (state-machine.ts). Status only ever moves
-- observed -> completed, and only when sync sees the counterpart on chain:
--   s2m completed: the nonce is in the contract's `mintedLocks`
--   m2s completed: a RELEASE log for the withdrawal id
-- Every write is an idempotent upsert, so replaying any input (a restart, a
-- full re-sync from the deployment start heights) converges to the same rows.
CREATE TABLE bridge_transfers (
  direction TEXT NOT NULL CHECK (direction IN ('s2m', 'm2s')),
  source_id NUMERIC(20, 0) NOT NULL,
  amount NUMERIC(20, 0) NOT NULL,
  -- s2m: 128 hex chars, Midnight coin public key || encryption public key
  -- m2s: the Solana owner (base58) that receives the release
  -- NULL until the side that carries it has been seen.
  recipient TEXT,
  -- s2m: the Solana depositor (base58); m2s: NULL (the burner is shielded)
  sender TEXT,
  status TEXT NOT NULL CHECK (status IN ('observed', 'completed')),
  -- Where sync saw each side: 'solana-slot:<slot>' / 'midnight-block:<effectstream block>'.
  src_ref TEXT,
  dst_ref TEXT,
  observed_block INTEGER NOT NULL,
  completed_block INTEGER,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (direction, source_id)
);

CREATE INDEX idx_bridge_transfers_status ON bridge_transfers (status, direction, source_id);

-- OWNED BY THE RELAYER (relayer/). One row per transfer the relayer has acted
-- on: attempts, the last counterpart transaction it submitted and the last
-- error. It never decides completion (the state machine does).
CREATE TABLE relayer_jobs (
  direction TEXT NOT NULL CHECK (direction IN ('s2m', 'm2s')),
  source_id NUMERIC(20, 0) NOT NULL,
  submitted_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  last_tx TEXT,
  PRIMARY KEY (direction, source_id)
);
