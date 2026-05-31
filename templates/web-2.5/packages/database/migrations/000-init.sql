-- web-2.5: single users table. Wallet is the primary key; name + experience
-- are mutated by the changedName / gainedExperience state transitions.
CREATE TABLE users (
  wallet TEXT NOT NULL PRIMARY KEY,
  name TEXT,
  experience INTEGER NOT NULL DEFAULT 0
);
