CREATE TABLE IF NOT EXISTS token_prices (
    token_color TEXT PRIMARY KEY,
    price_usd   NUMERIC NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
