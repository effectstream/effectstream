CREATE TABLE IF NOT EXISTS pair_stats (
    pair_key       TEXT PRIMARY KEY,   -- LEAST(a,b)||'|'||GREATEST(a,b)
    base_color     TEXT NOT NULL,
    quote_color    TEXT NOT NULL,
    trade_count    INTEGER NOT NULL DEFAULT 0,
    last_price     NUMERIC,
    last_traded_at TIMESTAMPTZ
);
