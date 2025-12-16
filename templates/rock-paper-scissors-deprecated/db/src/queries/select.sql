/* @name getPaginatedOpenLobbies */
SELECT 
lobbies.lobby_id,
lobbies.num_of_rounds,
lobbies.round_length,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.lobby_state,
lobbies.latest_match_state,
lobbies.round_winner
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name searchPaginatedOpenLobbies */
SELECT 
lobbies.lobby_id,
lobbies.num_of_rounds,
lobbies.round_length,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.lobby_state,
lobbies.latest_match_state,
lobbies.round_winner
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet AND lobbies.lobby_id LIKE :searchQuery
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name getOpenLobbyById */
SELECT 
lobbies.lobby_id,
lobbies.num_of_rounds,
lobbies.round_length,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.lobby_state,
lobbies.latest_match_state,
lobbies.round_winner
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :wallet;

/* @name getRandomLobby */
SELECT
lobbies.lobby_id,
lobbies.num_of_rounds,
lobbies.round_length,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.lobby_state,
lobbies.latest_match_state,
lobbies.round_winner
FROM lobbies
WHERE random() < 0.1
AND lobbies.lobby_state = 'open' AND lobbies.hidden is FALSE
LIMIT 1;

/* @name getRandomActiveLobby */
SELECT * FROM lobbies
WHERE random() < 0.1
AND lobbies.lobby_state = 'active'
LIMIT 1;

/* @name getUserLobbies */
SELECT * FROM lobbies
WHERE lobbies.lobby_state != 'finished'
AND lobbies.lobby_state != 'closed'
AND (lobbies.lobby_creator = :wallet
OR lobbies.player_two = :wallet)
ORDER BY created_at DESC;

/* @name getPaginatedUserLobbies */
SELECT * FROM lobbies
WHERE lobbies.lobby_state != 'finished'
AND lobbies.lobby_state != 'closed'
AND (lobbies.lobby_creator = :wallet
OR lobbies.player_two = :wallet)
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name getAllPaginatedUserLobbies */
SELECT * FROM lobbies
WHERE (lobbies.lobby_creator = :wallet
OR lobbies.player_two = :wallet)
ORDER BY lobby_state = 'active' DESC,
         lobby_state = 'open' DESC,
         lobby_state = 'finished' DESC,
         created_at DESC
LIMIT :count
OFFSET :page;

/* @name getActiveLobbies */
SELECT * FROM lobbies
WHERE lobbies.lobby_state = 'active';

/* @name getLobbyById */
SELECT * FROM lobbies
WHERE lobby_id = :lobby_id;

/* @name getUserStats */
SELECT * FROM global_user_state
WHERE wallet = :wallet;

/* @name getBothUserStats */
SELECT global_user_state.wallet, wins, losses, ties
FROM global_user_state
WHERE global_user_state.wallet = :wallet
OR global_user_state.wallet = :wallet2;

/* @name getMatchUserStats */
SELECT * FROM global_user_state
INNER JOIN lobbies
ON lobbies.lobby_creator = global_user_state.wallet
OR lobbies.player_two = global_user_state.wallet
WHERE global_user_state.wallet = :wallet1;

/* @name getRoundMoves */
SELECT * FROM match_moves
WHERE lobby_id = :lobby_id!
AND   round = :round!;

/* @name getCachedMoves */
SELECT
match_moves.id,
match_moves.lobby_id,
match_moves.wallet,
match_moves.move_rps,
match_moves.round
FROM match_moves
INNER JOIN rounds
ON match_moves.lobby_id = rounds.lobby_id
AND match_moves.round = rounds.round_within_match
WHERE rounds.execution_block_height IS NULL
AND match_moves.lobby_id = :lobby_id;

/* @name getMovesByLobby */
SELECT *
FROM match_moves
WHERE match_moves.lobby_id = :lobby_id;


/* @name getNewLobbiesByUserAndBlockHeight */
SELECT lobby_id FROM lobbies
WHERE lobby_creator = :wallet
AND creation_block_height = :block_height;

/* @name getRoundData */
SELECT * FROM rounds
WHERE lobby_id = :lobby_id!
AND round_within_match = :round_number;

/* @name getMatchSeeds */
SELECT * FROM rounds
INNER JOIN block_heights
ON block_heights.block_height = rounds.execution_block_height
WHERE rounds.lobby_id = :lobby_id;

/* @name getFinalState */
SELECT * FROM final_match_state
WHERE lobby_id = :lobby_id;
