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

/* @name updateLatestMatchState */
UPDATE lobbies
SET latest_match_state = :latest_match_state!
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
