CREATE TABLE IF NOT EXISTS solana_balance_events (
  id SERIAL PRIMARY KEY,
  slot INTEGER NOT NULL,
  address TEXT NOT NULL,
  lamports BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- `amount` is a raw SPL u64 in base units. TEXT, not BIGINT: a u64 exceeds
-- PostgreSQL's signed bigint at the top of its range, and the grammar carries it as
-- a string for the same reason.
CREATE TABLE IF NOT EXISTS solana_token_events (
  id SERIAL PRIMARY KEY,
  slot INTEGER NOT NULL,
  token_account TEXT NOT NULL,
  mint TEXT NOT NULL,
  owner TEXT NOT NULL,
  amount TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solana_log_events (
  id SERIAL PRIMARY KEY,
  slot INTEGER NOT NULL,
  program_id TEXT NOT NULL,
  log_messages JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
