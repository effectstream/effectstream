/* @name getLobbyById */
SELECT * FROM lobbies
WHERE lobby_id = :lobby_id;

/* @name getUserStats */
SELECT * FROM global_user_state
WHERE wallet = :wallet;

/* @name getPaginatedOpenLobbies */
SELECT * FROM lobbies
WHERE lobby_state = 'open' AND hidden = false
ORDER BY created_at DESC
LIMIT :count OFFSET :page;

/* @name getUserLobbies */
SELECT * FROM lobbies
WHERE (lobby_creator = :wallet OR player_two = :wallet)
  AND lobby_state IN ('active', 'finished')
ORDER BY created_at DESC
LIMIT :count OFFSET :page;

/* @name getRoundData */
SELECT * FROM rounds
WHERE lobby_id = :lobby_id AND round_within_match = :round;

/* @name getCachedMoves */
SELECT * FROM match_moves
WHERE lobby_id = :lobby_id AND round = :round;

/* @name getFinalMatchState */
SELECT * FROM final_match_state
WHERE lobby_id = :lobby_id;

/* @name getAllRounds */
SELECT * FROM rounds
WHERE lobby_id = :lobby_id
ORDER BY round_within_match ASC;
