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
