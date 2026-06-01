CREATE TABLE inputs_log (
  id SERIAL PRIMARY KEY,
  signer TEXT NOT NULL,
  payload TEXT NOT NULL,
  block_height INTEGER NOT NULL
);
