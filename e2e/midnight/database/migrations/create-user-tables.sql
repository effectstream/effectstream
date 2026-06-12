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

-- Token-mint registry: token id ("color") → the contract + domain separator
-- that minted it. The mapping columns are immutable (token_type is a pure
-- function of (domain_sep, contract_address)); total_minted accumulates
-- across mints; tx_hash/block_height keep first-mint provenance. kind is in
-- the key because shielded and unshielded share the derivation formula.
CREATE TABLE IF NOT EXISTS midnight_token_mints (
  id SERIAL PRIMARY KEY,
  token_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('shielded', 'unshielded')),
  contract_address TEXT NOT NULL,
  domain_sep TEXT NOT NULL,
  total_minted NUMERIC NOT NULL,
  tx_hash TEXT,
  block_height INTEGER NOT NULL,
  UNIQUE (token_type, kind)
);
