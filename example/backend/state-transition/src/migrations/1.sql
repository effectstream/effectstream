-- Example State Machine Table
CREATE TABLE example_sm (
  id SERIAL PRIMARY KEY,
  inputs TEXT NOT NULL,
  block_height INTEGER NOT NULL
);
