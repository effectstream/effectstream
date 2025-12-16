/* @name updateLobbyState */
UPDATE lobbies
SET lobby_state = :lobby_state!
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyPlayerTwo */
UPDATE lobbies
SET player_two = :player_two!, lobby_state = 'active'
WHERE lobby_id = :lobby_id!;

/* @name updateMatchState */
UPDATE lobbies
SET
  latest_match_state = :latest_match_state!,
  round_winner = :round_winner!
WHERE lobby_id = :lobby_id!;

/* @name updateRoundExecution */
UPDATE rounds
SET execution_block_height = :execution_block_height!
WHERE lobby_id = :lobby_id! AND round_within_match = :round_within_match!;

/* @name updateUserStats */
UPDATE global_user_state
SET
  wins = wins + :wins!,
  losses = losses + :losses!,
  ties = ties + :ties!
WHERE wallet = :wallet!;

/* @name closeLobby */
UPDATE lobbies
SET lobby_state = 'closed'
WHERE lobby_id = :lobby_id!;

/* @name finishLobby */
UPDATE lobbies
SET lobby_state = 'finished'
WHERE lobby_id = :lobby_id!;
