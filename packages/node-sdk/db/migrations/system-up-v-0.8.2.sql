CREATE TABLE effectstream.ckb_evm_relay_outbox (
  event_id TEXT NOT NULL,
  destination_chain_id BIGINT NOT NULL CHECK (destination_chain_id = 31337),
  destination_rpc_url TEXT NOT NULL,
  destination_contract TEXT NOT NULL CHECK (destination_contract ~ '^0x[0-9a-fA-F]{40}$'),
  source_event JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'pending', 'submitting', 'submitted', 'confirmed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  transaction_hash TEXT,
  payload_hash TEXT,
  receipt_status TEXT CHECK (receipt_status IS NULL OR receipt_status IN ('success', 'reverted')),
  receipt_block_number BIGINT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, destination_chain_id, destination_contract)
);

CREATE INDEX ckb_evm_relay_outbox_ready_idx
  ON effectstream.ckb_evm_relay_outbox (next_attempt_at, created_at)
  WHERE status IN ('processed', 'pending', 'submitting', 'submitted');
