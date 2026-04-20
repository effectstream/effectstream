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
