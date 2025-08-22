-- Example State Machine Table
CREATE TABLE user_state_machine (
  id SERIAL PRIMARY KEY,
  inputs TEXT NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE TABLE another_example_table (
  sum INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);
