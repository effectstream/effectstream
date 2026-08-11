CREATE SCHEMA IF NOT EXISTS midnight_v2_template;

CREATE TABLE IF NOT EXISTS midnight_v2_template.contract_events (
  event_identity TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL,
  event_version INTEGER NOT NULL,
  protocol_version INTEGER NOT NULL,
  indexer_transaction_id BIGINT NOT NULL,
  transaction_hash TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  block_height BIGINT NOT NULL,
  emitter_contract_address TEXT NOT NULL,
  event_type TEXT NOT NULL,
  digest TEXT NOT NULL,
  raw TEXT NOT NULL,
  CHECK (emitter_contract_address ~ '^[0-9a-f]{64}$'),
  CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
  CHECK (block_hash ~ '^[0-9a-f]{64}$'),
  CHECK (digest ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS contract_events_block_height_idx
  ON midnight_v2_template.contract_events (block_height, event_id);
