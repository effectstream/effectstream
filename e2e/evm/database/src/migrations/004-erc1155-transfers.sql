CREATE TABLE erc1155_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  token_id TEXT NOT NULL,
  amount TEXT NOT NULL
);
