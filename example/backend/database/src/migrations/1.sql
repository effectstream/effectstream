-- Example State Machine Table
CREATE TABLE user_state_machine (
  id SERIAL PRIMARY KEY,
  inputs TEXT NOT NULL,
  block_height INTEGER NOT NULL
);
