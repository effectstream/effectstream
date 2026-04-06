CREATE TABLE known_tokens (
    id SERIAL PRIMARY KEY,
    token_color TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
);

INSERT INTO known_tokens (token_color, name) VALUES
('0000000000000000000000000000000000000000000000000000000000000000', 'native_0'),
('0000000000000000000000000000000000000000000000000000000000000001', 'native_1'),
('0000000000000000000000000000000000000000000000000000000000000002', 'native_2')
ON CONFLICT (token_color) DO NOTHING;

CREATE TABLE offer_file (
    id SERIAL PRIMARY KEY,
    celestia_height BIGINT NOT NULL,
    transaction_hex TEXT NOT NULL,
    metadata_created_at TIMESTAMPTZ,
    metadata_expires_at TIMESTAMPTZ,
    metadata_maker_note TEXT,
    auth_signer_public_key TEXT,
    auth_signature TEXT,
    auth_scheme TEXT,
    -- TTL in seconds for how long this offer should remain active.
    -- Defaults to 7 days when not explicitly provided.
    ttl_seconds BIGINT NOT NULL DEFAULT 604800,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE offer_file_tokens (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL REFERENCES offer_file(id) ON DELETE CASCADE,
    token_color TEXT NOT NULL,
    amount TEXT NOT NULL,
    direction TEXT NOT NULL,
    UNIQUE(offer_file_id, token_color, direction)
);

-- Indexes to optimize common offer queries:
CREATE INDEX IF NOT EXISTS idx_offer_file_created_at
    ON offer_file (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offer_file_tokens_token_direction_offer
    ON offer_file_tokens (token_color, direction, offer_file_id);

CREATE INDEX IF NOT EXISTS idx_offer_file_tokens_offer_file_id
    ON offer_file_tokens (offer_file_id);

CREATE TABLE offer_file_nullifiers (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL REFERENCES offer_file(id) ON DELETE CASCADE,
    nullifier TEXT NOT NULL UNIQUE
);

CREATE TABLE offer_file_history (
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
    -- Copy of the TTL (in seconds) that was active for the original offer.
    ttl_seconds BIGINT,
    -- Reason why this offer was moved out of the main table.
    -- For example: 'CONSUMED' or 'TTL'.
    archive_reason TEXT,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE offer_file_tokens_history (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL,
    token_color TEXT NOT NULL,
    amount TEXT NOT NULL,
    direction TEXT NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE offer_file_nullifiers_history (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL,
    nullifier TEXT NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);
