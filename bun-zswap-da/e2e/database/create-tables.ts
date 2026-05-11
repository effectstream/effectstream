import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS known_tokens (
    id SERIAL PRIMARY KEY,
    token_color TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('shielded', 'unshielded'))
  );

  INSERT INTO known_tokens (token_color, name, kind) VALUES
  ('0000000000000000000000000000000000000000000000000000000000000000', 'native_0', 'shielded'),
  ('0000000000000000000000000000000000000000000000000000000000000001', 'native_1', 'shielded'),
  ('0000000000000000000000000000000000000000000000000000000000000002', 'native_2', 'shielded')
  ON CONFLICT (token_color) DO NOTHING;

  CREATE TABLE IF NOT EXISTS offer_file (
    id SERIAL PRIMARY KEY,
    celestia_height BIGINT NOT NULL,
    transaction_hex TEXT NOT NULL,
    metadata_created_at TIMESTAMPTZ,
    metadata_expires_at TIMESTAMPTZ,
    metadata_maker_note TEXT,
    auth_signer_public_key TEXT,
    auth_signature TEXT,
    auth_scheme TEXT,
    ttl_seconds BIGINT NOT NULL DEFAULT 604800,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS offer_file_tokens (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL REFERENCES offer_file(id) ON DELETE CASCADE,
    token_color TEXT NOT NULL,
    amount TEXT NOT NULL,
    direction TEXT NOT NULL,
    UNIQUE(offer_file_id, token_color, direction)
  );

  CREATE INDEX IF NOT EXISTS idx_offer_file_created_at ON offer_file (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_offer_file_tokens_token_direction_offer ON offer_file_tokens (token_color, direction, offer_file_id);
  CREATE INDEX IF NOT EXISTS idx_offer_file_tokens_offer_file_id ON offer_file_tokens (offer_file_id);

  CREATE TABLE IF NOT EXISTS offer_file_nullifiers (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL REFERENCES offer_file(id) ON DELETE CASCADE,
    nullifier TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS offer_file_history (
    id INTEGER PRIMARY KEY,
    celestia_height BIGINT NOT NULL,
    transaction_hex TEXT NOT NULL,
    metadata_created_at TIMESTAMPTZ,
    metadata_expires_at TIMESTAMPTZ,
    metadata_maker_note TEXT,
    auth_signer_public_key TEXT,
    auth_signature TEXT,
    auth_scheme TEXT,
    created_at TIMESTAMPTZ,
    ttl_seconds BIGINT,
    archive_reason TEXT,
    archived_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS offer_file_tokens_history (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL,
    token_color TEXT NOT NULL,
    amount TEXT NOT NULL,
    direction TEXT NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS offer_file_nullifiers_history (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL,
    nullifier TEXT NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Additional tables for e2e assertions
  CREATE TABLE IF NOT EXISTS midnight_state (
    id SERIAL PRIMARY KEY,
    block_height INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS midnight_nullifiers (
    id SERIAL PRIMARY KEY,
    nullifier TEXT NOT NULL UNIQUE,
    block_height INTEGER NOT NULL
  );
`);

await client.end();
console.log("ZSwap-DA e2e user tables created");
