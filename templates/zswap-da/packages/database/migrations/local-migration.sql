-- local-migration.sql
-- Applied after all default migrations. Add project-specific schema changes here.

-- Token price registry. Prices are in synthetic USD units used by /api/quote.
-- Seeded automatically on first quote request via the deterministic hash fallback;
-- update rows here to override with real market prices.
CREATE TABLE IF NOT EXISTS token_prices (
    token_color TEXT PRIMARY KEY,
    price_usd   NUMERIC NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
