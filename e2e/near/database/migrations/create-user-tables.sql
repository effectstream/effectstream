CREATE TABLE IF NOT EXISTS near_events (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS near_intent_events (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  token_diffs JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS near_account_watches (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  signer_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  method_name TEXT NOT NULL,
  args TEXT NOT NULL,
  deposit TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS near_nep141_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  old_owner_id TEXT NOT NULL,
  new_owner_id TEXT NOT NULL,
  amount TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS near_nep171_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  old_owner_id TEXT NOT NULL,
  new_owner_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  is_burn BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS near_nep245_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  old_owner_id TEXT NOT NULL,
  new_owner_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  is_mint BOOLEAN NOT NULL,
  is_burn BOOLEAN NOT NULL
);
