-- Example State Machine Table
CREATE TABLE custom.user_state_machine (
  id SERIAL PRIMARY KEY,
  inputs TEXT NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE TABLE custom.another_example_table (
  sum INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);
