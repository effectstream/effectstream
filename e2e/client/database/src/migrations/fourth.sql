CREATE TABLE counter_inputs (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  counter INTEGER NOT NULL
);

CREATE TABLE counter_entries (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  entry_id TEXT NOT NULL,
  value TEXT NOT NULL
);
