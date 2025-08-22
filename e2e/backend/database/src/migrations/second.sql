CREATE TABLE another_example_table (
  sum INTEGER NOT NULL,
  block_height INTEGER NOT NULL
);

CREATE TABLE test_2 (
  id SERIAL PRIMARY KEY,
  id_1 INTEGER NOT NULL REFERENCES user_state_machine(id)
);