/* @name updateLobbyToActive */
UPDATE lobby
SET lobby_state = 'active',
    started_block_height = :started_block_height!,
    seed = :seed!
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyToClosed */
UPDATE lobby
SET lobby_state = 'closed'
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyWinner */
UPDATE lobby
SET game_winner = :game_winner!,
    lobby_state = 'finished'
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyGameState */
UPDATE lobby
SET game_state = :game_state!,
    current_round = :current_round!
WHERE lobby_id = :lobby_id!;

/* @name updatePlayerWin */
UPDATE player
SET wins = wins + 1,
    played_games = played_games + 1,
    last_block_height = :last_block_height!
WHERE wallet = :wallet!;

/* @name updatePlayerLoss */
UPDATE player
SET losses = losses + 1,
    played_games = played_games + 1,
    last_block_height = :last_block_height!
WHERE wallet = :wallet!;

/* @name updatePlayerDraw */
UPDATE player
SET draws = draws + 1,
    played_games = played_games + 1,
    last_block_height = :last_block_height!
WHERE wallet = :wallet!;
