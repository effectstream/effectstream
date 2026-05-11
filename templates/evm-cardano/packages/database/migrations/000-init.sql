CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  chain TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  amount TEXT,
  tx_hash TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_chain ON events(chain);
CREATE INDEX idx_events_block ON events(block_height DESC);

CREATE TABLE chain_stats (
  chain TEXT PRIMARY KEY,
  latest_block INTEGER NOT NULL DEFAULT 0,
  total_events INTEGER NOT NULL DEFAULT 0
);

INSERT INTO chain_stats (chain) VALUES ('evm'), ('cardano');
