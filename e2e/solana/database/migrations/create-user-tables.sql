CREATE TABLE IF NOT EXISTS solana_balance_events (
  id SERIAL PRIMARY KEY,
  slot INTEGER NOT NULL,
  address TEXT NOT NULL,
  lamports BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solana_log_events (
  id SERIAL PRIMARY KEY,
  slot INTEGER NOT NULL,
  program_id TEXT NOT NULL,
  log_messages JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
