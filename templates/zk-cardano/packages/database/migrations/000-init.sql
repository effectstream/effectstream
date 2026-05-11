CREATE TABLE eligible_voters (
  id SERIAL PRIMARY KEY,
  staking_credential TEXT NOT NULL UNIQUE,
  pool TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  block_height INTEGER NOT NULL,
  registered_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE proposals (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  block_height INTEGER NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE vote_tallies (
  proposal_id INTEGER PRIMARY KEY REFERENCES proposals(id),
  yes_count INTEGER NOT NULL DEFAULT 0,
  no_count INTEGER NOT NULL DEFAULT 0,
  block_height INTEGER NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
