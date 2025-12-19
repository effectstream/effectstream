-- Generic paima engine table, that can't be modified
CREATE TABLE block_heights ( 
  block_height INTEGER PRIMARY KEY,
  seed TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false
);

-- Extend the schema to fit your needs
CREATE TYPE lobby_status AS ENUM ('open', 'active', 'finished', 'closed');
CREATE TABLE lobbies (
  lobby_id TEXT PRIMARY KEY,
  max_players INTEGER NOT NULL,
  num_of_rounds INTEGER NOT NULL,
  round_length INTEGER NOT NULL,
  play_time_per_player INTEGER NOT NULL,
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
  starting_block_height INTEGER NOT NULL references block_heights(block_height)
);

CREATE TABLE match_round(
  id SERIAL PRIMARY KEY,
  lobby_id TEXT NOT NULL references lobbies(lobby_id),
  match_within_lobby INTEGER NOT NULL,
  round_within_match INTEGER NOT NULL,
  starting_block_height INTEGER NOT NULL references block_heights(block_height),
  execution_block_Height INTEGER references block_heights(block_height)
);

CREATE TABLE round_move (
  id SERIAL PRIMARY KEY,
  lobby_id TEXT NOT NULL references lobbies(lobby_id),
  match_within_lobby INTEGER NOT NULL,
  round_within_match INTEGER NOT NULL,
  move_within_round INTEGER NOT NULL,
  nft_id INTEGER NOT NULL,
  roll_again BOOLEAN NOT NULL
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
  -- TODO: should ref global_user_state, but bot does not have an entry
  nft_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  turn INTEGER
);
