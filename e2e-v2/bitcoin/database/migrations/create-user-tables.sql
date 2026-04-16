CREATE TABLE IF NOT EXISTS bitcoin_transactions (
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
