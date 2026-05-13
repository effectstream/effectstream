CREATE TABLE gate_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  accepting BOOLEAN NOT NULL DEFAULT true,
  CHECK (id = 1)
);

CREATE TABLE commands (
  id SERIAL PRIMARY KEY,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  block_height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO gate_config (accepting) VALUES (true);
