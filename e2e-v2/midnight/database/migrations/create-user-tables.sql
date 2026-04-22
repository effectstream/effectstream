CREATE TABLE IF NOT EXISTS midnight_state (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  primitive_name TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
