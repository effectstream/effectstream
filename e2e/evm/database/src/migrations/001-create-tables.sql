CREATE TABLE game_results (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  result INTEGER NOT NULL
);
CREATE TABLE erc20_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE erc721_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  token_id TEXT NOT NULL
);
CREATE TABLE erc1155_transfers (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  token_id TEXT NOT NULL,
  amount TEXT NOT NULL
);
CREATE TABLE counter_results (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  counter_value INTEGER NOT NULL
);
