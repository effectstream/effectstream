/* @name getGameState */
SELECT lobby_state, current_round FROM lobby
WHERE lobby_id = :lobby_id!;

/* @name getOpenLobbies */
SELECT
    lobby_creator,
    lobby_id,
    lobby_state,
    num_of_players,
    units,
    buildings,
    gold,
    init_tiles,
    time_limit,
    round_limit,
    creation_block_height,
    seed
FROM lobby
WHERE lobby_state = 'open'
ORDER BY creation_block_height DESC;

/* @name getLatestCreatedLobby */
SELECT lobby_id, lobby_state, num_of_players, current_round, lobby_creator FROM lobby
WHERE lobby_state = 'open'
AND lobby_creator = :lobby_creator!
ORDER BY creation_block_height DESC
LIMIT 1;

/* @name getLobbyMap */
SELECT lobby_id, map
FROM lobby
WHERE lobby_id = :lobby_id!;

/* @name getLobbyGameState */
SELECT lobby_id, game_state
FROM lobby
WHERE lobby_id = :lobby_id!;

/* @name getLobbyLean */
SELECT lobby_id,
    current_round,
    created_at,
    lobby_creator,
    lobby_state,
    game_winner,
    num_of_players,
    units,
    buildings,
    gold,
    init_tiles,
    time_limit,
    round_limit,
    started_block_height,
    seed
FROM lobby
WHERE lobby_id = :lobby_id!;

/* @name getLobbyById */
SELECT * FROM lobby
WHERE lobby_id = :lobby_id!;

/* @name getLobbyPlayers */
SELECT * FROM lobby_player
WHERE lobby_id = :lobby_id!
ORDER BY id ASC;

/* @name getLobbyRounds */
SELECT * FROM round
WHERE lobby_id = :lobby_id!;

/* @name getPlayerByWallet */
SELECT * FROM player
WHERE wallet = :wallet!;

/* @name getPlayersByWins */
SELECT * FROM player
ORDER BY wins DESC
LIMIT :limit!
OFFSET :offset!;
