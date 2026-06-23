CREATE TABLE IF NOT EXISTS solana_memos (
  id SERIAL PRIMARY KEY,
  slot INTEGER NOT NULL,
  program_id TEXT NOT NULL,
  log_messages JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
