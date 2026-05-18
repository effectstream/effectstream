CREATE TABLE IF NOT EXISTS nft_locks (
  id SERIAL PRIMARY KEY,
  owner_address TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  status TEXT NOT NULL,
  current_tx_id TEXT NOT NULL,
  previous_tx_id TEXT,
  current_output_index TEXT,
  previous_output_index TEXT,
  for_how_long TEXT,
  block_height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
