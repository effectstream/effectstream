-- Generic effectstream engine table, that can't be modified.
-- (In v1 this also stored the per-block randomness seed; the modern engine
--  manages randomness via data.randomGenerator, so we keep only this stub for
--  parity with the canonical templates.)
CREATE TABLE block_heights (
  block_height INTEGER PRIMARY KEY,
  seed TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false
);

-- ===========================================================================
-- Trading Cards schema.
--
-- Ported from the @paima v1 game's db/migrations/init/init.sql (10 tables).
-- Changes from v1:
--   * `block_heights` foreign keys dropped from lobby_match / match_round —
--     the modern engine owns randomness (data.randomGenerator), so rounds no
--     longer reseed Prando from a stored per-block seed.
--   * `nft_ownership` added (mirrors the dice/nft templates): the ERC721
--     ownership primitive + the accountMint L2 action both write here so the
--     game can answer "which account NFT does this wallet own?".
-- ===========================================================================

CREATE TYPE lobby_status AS ENUM ('open', 'active', 'finished', 'closed');
CREATE TYPE concise_result AS ENUM ('w', 't', 'l');

CREATE TABLE lobbies (
  lobby_id TEXT PRIMARY KEY,
  max_players INTEGER NOT NULL,
  num_of_rounds INTEGER NOT NULL,
  turn_length INTEGER NOT NULL,
  current_match INTEGER,
  current_round INTEGER,
  current_turn INTEGER,
  current_proper_round INTEGER,
  created_at TIMESTAMP NOT NULL,
  creation_block_height INTEGER NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT false,
  practice BOOLEAN NOT NULL DEFAULT false,
  lobby_creator INTEGER NOT NULL,
  lobby_state lobby_status NOT NULL
);

CREATE TABLE lobby_match(
  id SERIAL PRIMARY KEY,
  lobby_id TEXT NOT NULL references lobbies(lobby_id),
  match_within_lobby INTEGER NOT NULL,
  starting_block_height INTEGER NOT NULL
);

CREATE TABLE match_round(
  id SERIAL PRIMARY KEY,
  lobby_id TEXT NOT NULL references lobbies(lobby_id),
  match_within_lobby INTEGER NOT NULL,
  round_within_match INTEGER NOT NULL,
  starting_block_height INTEGER NOT NULL,
  execution_block_height INTEGER
);

CREATE TABLE round_move (
  id SERIAL PRIMARY KEY,
  lobby_id TEXT NOT NULL references lobbies(lobby_id),
  match_within_lobby INTEGER NOT NULL,
  round_within_match INTEGER NOT NULL,
  move_within_round INTEGER NOT NULL,
  nft_id INTEGER NOT NULL,
  serialized_move TEXT NOT NULL
);

CREATE TABLE global_user_state (
  nft_id INTEGER NOT NULL PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lobby_player (
  id SERIAL PRIMARY KEY,
  lobby_id TEXT NOT NULL references lobbies(lobby_id),
  -- TODO: should ref global_user_state, but the practice bot has no entry
  nft_id INTEGER NOT NULL,
  starting_commitments TEXT NOT NULL DEFAULT '',
  hit_points INTEGER NOT NULL DEFAULT 4,
  -- card-commitment indices still in the player's deck
  current_deck INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  -- serialized hand cards (card-registry ids drawn this match)
  current_hand INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  -- serialized board cards (card-registry ids the player has played)
  current_board INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  current_draw INTEGER NOT NULL DEFAULT 0,
  current_result concise_result DEFAULT NULL,
  turn INTEGER
);

-- A card owned by an account NFT. `owner_nft_id` is NULL while the card is
-- assigned to a trade NFT (see card_trade_nft).
CREATE TABLE cards (
  id SERIAL PRIMARY KEY,
  owner_nft_id INTEGER references global_user_state(nft_id),
  registry_id INTEGER NOT NULL
);

-- A record of every card pack that was bought (the buyer may have traded the
-- cards away since).
CREATE TABLE card_packs (
  id SERIAL PRIMARY KEY,
  buyer_nft_id INTEGER NOT NULL references global_user_state(nft_id),
  card_registry_ids INTEGER[] NOT NULL
);

-- A trade NFT and the card ids currently bundled into it (NULL = empty).
CREATE TABLE card_trade_nft (
  nft_id INTEGER NOT NULL PRIMARY KEY,
  cards INTEGER[]
);
