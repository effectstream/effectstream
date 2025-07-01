-- Example State Machine Table
CREATE TABLE paima_state_machine (
  id SERIAL PRIMARY KEY,
  inputs TEXT NOT NULL,
  block_height INTEGER NOT NULL
);
