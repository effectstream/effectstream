CREATE TABLE delegations (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  address TEXT NOT NULL,
  pool TEXT NOT NULL,
  epoch TEXT NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_delegations_pool ON delegations(pool);
CREATE INDEX idx_delegations_address ON delegations(address);

CREATE TABLE pool_stats (
  pool TEXT PRIMARY KEY,
  total_delegators INTEGER NOT NULL DEFAULT 0,
  latest_epoch TEXT NOT NULL DEFAULT '0',
  latest_block INTEGER NOT NULL DEFAULT 0
);
INSERT INTO pool_stats (pool) VALUES ('7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57');
