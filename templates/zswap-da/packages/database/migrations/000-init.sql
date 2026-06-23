CREATE TABLE known_tokens (
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
    -- Default = 1 hour (matches the Midnight reference Merkle-root window
    -- on the shielded path; see packages/node/env.ts for the full rationale).
    ttl_seconds BIGINT NOT NULL DEFAULT 3600,
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

-- A single shielded coin can back multiple competing offers (e.g. maker
-- posts A→NIGHT and A→USDC both spending the same coin). All such offers
-- share the same nullifier and are mutually exclusive — the first one to
-- land wins. So the constraint is per-offer, not global.
CREATE TABLE offer_file_nullifiers (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL REFERENCES offer_file(id) ON DELETE CASCADE,
    nullifier TEXT NOT NULL,
    UNIQUE (offer_file_id, nullifier)
);

CREATE INDEX IF NOT EXISTS idx_offer_file_nullifiers_nullifier
    ON offer_file_nullifiers (nullifier);

-- Same multi-offer rule as nullifiers: a single unshielded UTXO can be
-- referenced by multiple competing offers.
CREATE TABLE offer_file_unshielded_spends (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL REFERENCES offer_file(id) ON DELETE CASCADE,
    owner TEXT NOT NULL,
    intent_hash TEXT NOT NULL,
    output_no INTEGER NOT NULL,
    UNIQUE (offer_file_id, owner, intent_hash, output_no)
);

CREATE INDEX IF NOT EXISTS idx_offer_file_unshielded_spends_lookup
    ON offer_file_unshielded_spends (owner, intent_hash, output_no);

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
    --   'CONSUMED' — one of the offer's inputs was spent on Midnight. This
    --     conflates *filled* (the offer's intended swap completed) and
    --     *canceled* (the maker spent the coin elsewhere) — the indexer
    --     watches input nullifiers/UTXO refs only, not output commitments,
    --     so the two cases produce identical signals.
    --   'TTL' — the scheduled cleanup timer fired before any consumption
    --     was observed. Note this does not mean the offer was still
    --     fillable on chain right up until then — see env.ts for the
    --     Merkle-root-window caveat on the shielded path.
    -- Archival is destructive (live row is DELETEd). If the consuming
    -- block is later reorged out, the offer cannot be restored without a
    -- full resync. Only safe when archive-triggering events come from
    -- finalized blocks.
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

CREATE TABLE offer_file_unshielded_spends_history (
    id SERIAL PRIMARY KEY,
    offer_file_id INTEGER NOT NULL,
    owner TEXT NOT NULL,
    intent_hash TEXT NOT NULL,
    output_no INTEGER NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unified nullifier table (replaces seen_nullifiers + spent_nullifiers).
-- offer_matched=true:  matched to an indexed offer — permanent record used
--   by the validator to reject double-spend attempts.
-- offer_matched=false: early-arrival race buffer (Midnight event arrived
--   before the Celestia offer was indexed). Pruned by the midnight-nullifier
--   STF after SEEN_NULLIFIER_TTL_SECONDS (default 30 days).
CREATE TABLE nullifiers (
    nullifier     TEXT        PRIMARY KEY,
    height        BIGINT      NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    offer_matched BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_nullifiers_unmatched ON nullifiers (recorded_at)
    WHERE offer_matched = false;

