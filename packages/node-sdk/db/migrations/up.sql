CREATE TABLE paima_blocks (
  block_height INTEGER PRIMARY KEY,
  ver INTEGER NOT NULL,
  main_chain_block_hash BYTEA NOT NULL,
  seed TEXT NOT NULL,
  ms_timestamp TIMESTAMP without time zone NOT NULL,

  -- note: slightly awkward, but this field is nullable
  --       this helps other SQL queries refer to the block before the block is done being processed
  paima_block_hash BYTEA
);

CREATE TABLE rollup_inputs (
  id SERIAL PRIMARY KEY,
  from_address TEXT NOT NULL,
  input_data TEXT NOT NULL
);

CREATE TABLE rollup_input_future_block (
  id INTEGER PRIMARY KEY REFERENCES rollup_inputs(id) ON DELETE CASCADE,
  future_block_height INTEGER NOT NULL
);
CREATE TABLE rollup_input_future_timestamp (
  id INTEGER PRIMARY KEY REFERENCES rollup_inputs(id) ON DELETE CASCADE,
  future_ms_timestamp TIMESTAMP without time zone NOT NULL
);

CREATE TABLE rollup_input_result (
  id INTEGER PRIMARY KEY REFERENCES rollup_inputs(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  paima_tx_hash BYTEA NOT NULL,
  block_height INTEGER NOT NULL REFERENCES paima_blocks(block_height),
  index_in_block INTEGER NOT NULL
);

CREATE TABLE rollup_input_origin (
  id INTEGER PRIMARY KEY REFERENCES rollup_inputs(id) ON DELETE CASCADE,
  primitive_name TEXT,
  caip2 TEXT,
  tx_hash BYTEA,
  contract_address TEXT
);

CREATE TABLE primitive_accounting (
  primitive_name TEXT NOT NULL,
  id SERIAL,
  paima_block_height INTEGER NOT NULL,
  payload_type TEXT NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (primitive_name, id)
);

CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  block_height INTEGER NOT NULL
);

CREATE TABLE sync_protocol_pagination (
  protocol_name TEXT PRIMARY KEY,
  page JSONB NOT NULL
);

CREATE TABLE primitive_config (
  primitive_name TEXT PRIMARY KEY,
  primitive_type TEXT NOT NULL,
  primitive_caip2 TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  config JSONB NOT NULL,
  config_hash INTEGER NOT NULL,
  parent_name TEXT -- for dynamic primitives
);

CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  address TEXT NOT NULL UNIQUE
);

CREATE TABLE delegations (
  from_id INTEGER NOT NULL REFERENCES addresses(id),
  to_id INTEGER NOT NULL REFERENCES addresses(id),
 PRIMARY KEY (from_id, to_id)
);

CREATE TABLE achievement_progress(
  wallet INTEGER NOT NULL REFERENCES addresses(id),
  name TEXT NOT NULL,
  completed_date TIMESTAMP,
  progress INTEGER,
  total INTEGER,
  PRIMARY KEY (wallet, name)
);

CREATE TABLE event (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  address TEXT NOT NULL,
  data JSONB NOT NULL,
  block_height INTEGER NOT NULL,
  tx_index INTEGER NOT NULL,
  log_index INTEGER NOT NULL
);

CREATE TABLE registered_event (
  name TEXT NOT NULL,
  topic TEXT NOT NULL,
  PRIMARY KEY(name, topic)
);
