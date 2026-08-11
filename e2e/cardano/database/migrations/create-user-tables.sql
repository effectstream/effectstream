CREATE TABLE IF NOT EXISTS cardano_transactions (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  bytes_hex TEXT NOT NULL
);

-- ── Cardano Primitive Verification Tables ───────────────────────────────────
-- These tables are written to by STM state transitions to verify that each
-- Cardano primitive correctly extracts data from raw UTxORPC transactions.

CREATE TABLE IF NOT EXISTS cardano_mint_burn_events (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  tx_id TEXT NOT NULL,
  metadata TEXT,
  assets JSONB NOT NULL,
  input_addresses JSONB NOT NULL,
  output_addresses JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cardano_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  tx_id TEXT NOT NULL,
  metadata TEXT,
  input_credentials JSONB NOT NULL,
  outputs JSONB NOT NULL,
  signer_key_hashes JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cardano_delegations (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  address TEXT NOT NULL,
  pool TEXT NOT NULL,
  epoch INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cardano_asset_utxos (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  address TEXT NOT NULL,
  tx_id TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  cip14_fingerprint TEXT NOT NULL,
  amount TEXT,
  policy_id TEXT NOT NULL,
  asset_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cardano_projected_nfts (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  owner_address TEXT NOT NULL,
  previous_tx_id TEXT,
  previous_output_index INTEGER,
  current_tx_id TEXT NOT NULL,
  current_output_index INTEGER,
  policy_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  status TEXT NOT NULL,
  for_how_long TEXT
);
