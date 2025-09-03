/* @name getPaginatedOpenLobbies */
SELECT 
lobbies.lobby_id,
lobbies.num_of_rounds,
lobbies.round_length,
lobbies.play_time_per_player,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.player_one_iswhite,
lobbies.lobby_state,
lobbies.latest_match_state,
global_user_state.rating
FROM lobbies
JOIN global_user_state ON lobbies.lobby_creator = global_user_state.wallet
WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :wallet
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name searchPaginatedOpenLobbies */
SELECT 
lobbies.lobby_id,
lobbies.num_of_rounds,
lobbies.round_length,
lobbies.play_time_per_player,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.player_one_iswhite,
lobbies.lobby_state,
lobbies.latest_match_state
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
lobbies.play_time_per_player,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.player_one_iswhite,
lobbies.lobby_state,
lobbies.latest_match_state
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :wallet;

/* @name getRandomLobby */
SELECT
lobbies.lobby_id,
lobbies.num_of_rounds,
lobbies.round_length,
lobbies.play_time_per_player,
lobbies.current_round,
lobbies.created_at,
lobbies.creation_block_height,
lobbies.hidden,
lobbies.lobby_creator,
lobbies.player_one_iswhite,
lobbies.lobby_state,
lobbies.latest_match_state
FROM lobbies
WHERE random() < 0.1
AND lobbies.lobby_state = 'open' AND lobbies.hidden is FALSE
LIMIT 1;

/* @name getRandomActiveLobby */
SELECT * FROM lobbies
WHERE random() < 0.1
AND lobbies.lobby_state = 'active'
LIMIT 1;

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

/* @name getLobbyById */
SELECT * FROM lobbies
WHERE lobby_id = :lobby_id;

/* @name getUserStats */
SELECT * FROM global_user_state
WHERE wallet = :wallet;

/* @name getUserRatingPosition */
SELECT count(*)+1 as rank
FROM global_user_state
WHERE rating > :rating!;

/* @name getRoundMoves */
SELECT * FROM match_moves
WHERE lobby_id = :lobby_id!
AND   round = :round!;

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

/* @name getLobbyRounds */
SELECT * FROM rounds
WHERE lobby_id = :lobby_id;
