CREATE TABLE IF NOT EXISTS midnight_state (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  primitive_name TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS midnight_nullifiers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  nullifier TEXT NOT NULL UNIQUE,
  tx_hash TEXT
);

CREATE TABLE IF NOT EXISTS midnight_unshielded_creates (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  owner TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  output_index INTEGER NOT NULL,
  tx_hash TEXT,
  UNIQUE (owner, intent_hash, output_index)
);

CREATE TABLE IF NOT EXISTS midnight_zswap_roots (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  root TEXT NOT NULL UNIQUE,
  tx_hash TEXT
);
