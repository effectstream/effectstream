CREATE TABLE example_table (
  id SERIAL PRIMARY KEY,
  chain TEXT NOT NULL,
  action TEXT NOT NULL,
  data text NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE INDEX example_table_chain_index ON example_table(chain, block_height);