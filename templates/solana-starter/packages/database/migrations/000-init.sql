-- Latest counter value per authority (one PDA per user on-chain).
CREATE TABLE counter_state (
  authority TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0,
  slot BIGINT NOT NULL,           -- Solana slot the value was last seen at
  block_height INTEGER NOT NULL,  -- engine block height, for ordering
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only log of counter changes.
CREATE TABLE counter_events (
  id SERIAL PRIMARY KEY,
  authority TEXT NOT NULL,
  value BIGINT NOT NULL,
  slot BIGINT NOT NULL,
  block_height INTEGER NOT NULL,
  kind TEXT NOT NULL,                  -- "increment" | "reset"
  delta BIGINT NOT NULL DEFAULT 0,
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_counter_events_authority ON counter_events (authority, id DESC);
