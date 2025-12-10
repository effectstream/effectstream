CREATE TABLE another_example_table (
  id SERIAL PRIMARY KEY,
  sum INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE TABLE test_2 (
  id SERIAL PRIMARY KEY,
  id_1 INTEGER NOT NULL REFERENCES user_state_machine(id)
);

CREATE TABLE bitcoin_transactions (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  direction TEXT NOT NULL,
  address TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  index INTEGER NOT NULL,
  value_sats BIGINT NOT NULL,
  utxo_txid TEXT NOT NULL,
  utxo_vout INTEGER NOT NULL,
  label TEXT
);
