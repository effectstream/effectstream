CREATE TABLE erc20_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  value TEXT NOT NULL
);
