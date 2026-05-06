CREATE SCHEMA IF NOT EXISTS effectstream;
CREATE SCHEMA IF NOT EXISTS primitives;

CREATE TABLE effectstream.effectstream_blocks (
  block_height INTEGER PRIMARY KEY,
  ver INTEGER NOT NULL,
  main_chain_block_hash BYTEA NOT NULL,
  seed TEXT NOT NULL,
  ms_timestamp TIMESTAMP without time zone NOT NULL,
  effectstream_block_hash BYTEA
);

-- Tighten autovacuum on effectstream_blocks: every finalized block produces
-- two dead tuples (one from pruneOldBlockHashes, one from blockHeightDone),
-- so the default 20% scale factor lets autovacuum fall behind on a long-
-- running node. Smaller, more frequent vacuums keep the heap compact.
ALTER TABLE effectstream.effectstream_blocks SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 1000
);

CREATE TABLE effectstream.rollup_inputs (
  id SERIAL PRIMARY KEY,
  from_address TEXT NOT NULL,
  from_address_type INTEGER NOT NULL,
  input_data TEXT NOT NULL
);

CREATE TABLE effectstream.rollup_input_future_block (
  id INTEGER PRIMARY KEY REFERENCES effectstream.rollup_inputs(id) ON DELETE CASCADE,
  future_block_height INTEGER NOT NULL
);
CREATE TABLE effectstream.rollup_input_future_timestamp (
  id INTEGER PRIMARY KEY REFERENCES effectstream.rollup_inputs(id) ON DELETE CASCADE,
  future_ms_timestamp TIMESTAMP without time zone NOT NULL
);

CREATE TABLE effectstream.rollup_input_result (
  id INTEGER PRIMARY KEY REFERENCES effectstream.rollup_inputs(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  effectstream_tx_hash BYTEA NOT NULL,
  block_height INTEGER NOT NULL REFERENCES effectstream.effectstream_blocks(block_height),
  index_in_block INTEGER NOT NULL
);

CREATE TABLE effectstream.rollup_input_origin (
  id INTEGER PRIMARY KEY REFERENCES effectstream.rollup_inputs(id) ON DELETE CASCADE,
  primitive_name TEXT,
  caip2 TEXT,
  tx_hash BYTEA,
  contract_address TEXT
);

CREATE TABLE effectstream.primitive_accounting (
  primitive_name TEXT NOT NULL,
  id SERIAL,
  effectstream_block_height INTEGER NOT NULL REFERENCES effectstream.effectstream_blocks(block_height),
  payload_type TEXT NOT NULL,
  payload JSON NOT NULL,
  payload_hash TEXT GENERATED ALWAYS AS (md5(payload::text)) STORED,
  PRIMARY KEY (primitive_name, id)
);

CREATE TABLE effectstream.nonces (
  nonce TEXT PRIMARY KEY,
  block_height INTEGER NOT NULL REFERENCES effectstream.effectstream_blocks(block_height)
);

CREATE TABLE effectstream.sync_protocol_pagination (
  protocol_name TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  page JSONB NOT NULL,
  PRIMARY KEY (protocol_name, page_number)
);

CREATE INDEX sync_protocol_pagination_page_number_idx on effectstream.sync_protocol_pagination(protocol_name, page_number);

CREATE TABLE effectstream.primitive_config (
  primitive_name TEXT PRIMARY KEY,
  primitive_type TEXT NOT NULL,
  primitive_caip2 TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  config JSONB NOT NULL,
  config_hash INTEGER NOT NULL,
  parent_name TEXT
);

CREATE TABLE effectstream.accounts (
  id SERIAL PRIMARY KEY,
  primary_address TEXT
);

CREATE TABLE effectstream.addresses (
  address TEXT NOT NULL UNIQUE,
  address_type INTEGER NOT NULL,
  account_id INTEGER REFERENCES effectstream.accounts(id)
);

CREATE INDEX addresses_account_id_idx ON effectstream.addresses(account_id);

ALTER TABLE effectstream.accounts ADD CONSTRAINT fk_primary_address_address FOREIGN KEY (primary_address) REFERENCES effectstream.addresses(address);

CREATE TABLE effectstream.achievement_progress(
  account_id INTEGER NOT NULL REFERENCES effectstream.accounts(id),
  name TEXT NOT NULL,
  completed_date TIMESTAMP,
  progress INTEGER,
  total INTEGER,
  PRIMARY KEY (account_id, name)
);

CREATE TABLE effectstream.event (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  address TEXT NOT NULL,
  data JSONB NOT NULL,
  block_height INTEGER NOT NULL,
  tx_index INTEGER NOT NULL,
  log_index INTEGER NOT NULL
);

CREATE TABLE effectstream.registered_event (
  name TEXT NOT NULL,
  topic TEXT NOT NULL,
  PRIMARY KEY(name, topic)
);
