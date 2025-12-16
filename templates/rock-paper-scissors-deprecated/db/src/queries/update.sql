/* @name startMatch */
UPDATE lobbies
SET  
lobby_state = 'active',
player_two = :player_two!
WHERE lobby_id = :lobby_id!
AND player_two IS NULL
RETURNING *;

/* @name closeLobby */
UPDATE lobbies
SET  
lobby_state = 'closed'
WHERE lobby_id = :lobby_id!
AND player_two IS NULL;

/* @name updateRound */
UPDATE lobbies
SET current_round = :round!
WHERE lobby_id = :lobby_id!;

/* @name updateLatestMatchState */
UPDATE lobbies
SET 
latest_match_state = :latest_match_state!,
round_winner = :round_winner!
WHERE lobby_id = :lobby_id!;

/* @name endMatch */
UPDATE lobbies
SET  lobby_state = 'finished'
WHERE lobby_id = :lobby_id!;

/* @name executedRound */
UPDATE rounds
SET execution_block_height = :execution_block_height!
WHERE rounds.lobby_id = :lobby_id!
AND rounds.round_within_match = :round!;

/* @name addWin */
UPDATE global_user_state
SET
wins = wins + 1
WHERE wallet = :wallet;

/* @name addLoss */
UPDATE global_user_state
SET
losses = losses + 1
WHERE wallet = :wallet;

/* @name addTie */
UPDATE global_user_state
SET
ties = ties + 1
WHERE wallet = :wallet;