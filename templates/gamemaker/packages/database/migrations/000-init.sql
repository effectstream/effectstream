-- Ported from the paima-engine-v1 `gamemaker` game (db/migrations/init/init.sql).
-- v1 also declared an engine-managed `block_heights` table; the Effectstream
-- engine now owns block tracking internally (effectstream.* schema), so the
-- only application table is `users`.
CREATE TABLE users (
  wallet TEXT NOT NULL PRIMARY KEY,
  experience INTEGER NOT NULL DEFAULT 0
);
