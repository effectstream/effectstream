CREATE TABLE IF NOT EXISTS cardano_transactions (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  bytes_hex TEXT NOT NULL
);
