-- Generic effectstream engine table, that can't be modified
CREATE TABLE block_heights (
  block_height INTEGER PRIMARY KEY,
  seed TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- Hex Battle schema (4 tables): lobby, lobby_player, round, player.
-- The whole hex-grid game state (tiles with q/r/s cube coords, owners, units,
-- buildings, player gold, turn, winner) is serialized into `lobby.game_state`
-- as JSON by the engine's Game.export(); the engine deserializes it again with
-- Game.import() on each move. The columns below are the indexable metadata.
-- ---------------------------------------------------------------------------
CREATE TYPE lobby_status AS ENUM ('open', 'active', 'finished', 'closed');

CREATE TABLE lobby (
  lobby_id CHAR(12) PRIMARY KEY,
  game_state TEXT NOT NULL DEFAULT '',
  current_round INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  started_block_height INTEGER,
  ended_block_height INTEGER,
  creation_block_height INTEGER NOT NULL,
  lobby_creator TEXT NOT NULL,
  lobby_state lobby_status NOT NULL,
  game_winner TEXT,
  num_of_players INTEGER NOT NULL,
  map TEXT,
  units TEXT,
  buildings TEXT,
  gold INTEGER NOT NULL,
  init_tiles INTEGER NOT NULL,
  time_limit INTEGER NOT NULL,
  round_limit INTEGER NOT NULL,
  seed TEXT
);

CREATE TABLE lobby_player (
  id SERIAL,
  lobby_id TEXT NOT NULL references lobby(lobby_id),
  player_wallet TEXT NOT NULL,
  PRIMARY KEY (lobby_id, player_wallet)
);

CREATE TABLE round (
  id SERIAL,
  lobby_id TEXT NOT NULL references lobby(lobby_id),
  wallet TEXT NOT NULL,
  move TEXT NOT NULL,
  round INTEGER NOT NULL,
  block_height INTEGER NOT NULL,
  seed TEXT,
  PRIMARY KEY (lobby_id, id)
);

CREATE TABLE player (
  wallet TEXT NOT NULL PRIMARY KEY,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  played_games INTEGER NOT NULL DEFAULT 0,
  last_block_height INTEGER NOT NULL
);
CREATE INDEX ON player (last_block_height);
CREATE INDEX ON player (played_games);
CREATE INDEX ON player (wins);
