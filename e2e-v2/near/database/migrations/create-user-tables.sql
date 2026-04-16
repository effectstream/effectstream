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
