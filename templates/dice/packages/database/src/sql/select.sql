/* @name getPaginatedOpenLobbies */
SELECT *
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :nft_id
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name searchPaginatedOpenLobbies */
SELECT *
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.hidden IS FALSE AND lobbies.lobby_creator != :nft_id AND lobbies.lobby_id LIKE :searchQuery
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name getOpenLobbyById */
SELECT *
FROM lobbies
WHERE lobbies.lobby_state = 'open' AND lobbies.lobby_id = :searchQuery AND lobbies.lobby_creator != :nft_id;

/* @name getLobbyPlayers */
SELECT *
FROM lobby_player
WHERE lobby_player.lobby_id = :lobby_id!;

/* @name getRandomLobby */
SELECT *
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
SELECT lobbies.*
FROM lobbies JOIN lobby_player
  ON lobbies.lobby_id = lobby_player.lobby_id
WHERE lobbies.lobby_state != 'finished'
AND lobbies.lobby_state != 'closed'
AND lobby_player.nft_id = :nft_id!
ORDER BY created_at DESC;

/* @name getPaginatedUserLobbies */
SELECT lobbies.*
FROM lobbies JOIN lobby_player
  ON lobbies.lobby_id = lobby_player.lobby_id
WHERE 
  lobbies.lobby_state != 'finished' AND
  lobbies.lobby_state != 'closed' AND
  lobby_player.nft_id = :nft_id!
GROUP BY lobbies.lobby_id
ORDER BY created_at DESC
LIMIT :count
OFFSET :page;

/* @name getAllPaginatedUserLobbies */
SELECT lobbies.*
FROM 
  lobbies JOIN lobby_player
    ON lobbies.lobby_id = lobby_player.lobby_id
WHERE lobby_player.nft_id = :nft_id!
GROUP BY lobbies.lobby_id
ORDER BY 
  lobby_state = 'active' DESC,
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
WHERE lobby_id = :lobby_id!;

/* @name getMatch */
SELECT * FROM lobby_match
WHERE 
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby!;

/* @name getUserStats */
SELECT * FROM global_user_state
WHERE nft_id = :nft_id;

/* @name getBothUserStats */
SELECT global_user_state.nft_id, wins, losses, ties
FROM global_user_state
WHERE global_user_state.nft_id = :nft_id_1
OR global_user_state.nft_id = :nft_id_2;

/* @name getRoundMoves */
SELECT *
FROM round_move
WHERE
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby! AND
  round_within_match = :round_within_match!
ORDER BY round_move.move_within_round;

/* @name getMatchMoves */
SELECT *
FROM round_move
WHERE 
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby!
ORDER BY
  round_move.round_within_match,
  round_move.move_within_round;

/* @name getNewLobbiesByUserAndBlockHeight */
SELECT lobby_id FROM lobbies
WHERE lobby_creator = :nft_id
AND creation_block_height = :block_height;

/* @name getRound */
SELECT *
FROM match_round
WHERE 
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby! AND
  round_within_match = :round_within_match!;

/* @name getMatchSeeds */
SELECT *
FROM match_round JOIN block_heights
  ON block_heights.block_height = match_round.execution_block_height
WHERE
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby!
ORDER BY match_round.round_within_match ASC;
