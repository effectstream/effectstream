/* @name createLobby */
INSERT INTO lobbies (
  lobby_id,
  num_of_rounds,
  round_length,
  round_winner,
  created_at,
  creation_block_height,
  hidden,
  practice,
  lobby_creator,
  lobby_state,
  latest_match_state
) VALUES (
  :lobby_id!,
  :num_of_rounds!,
  :round_length!,
  :round_winner!,
  :created_at!,
  :creation_block_height!,
  :hidden!,
  :practice!,
  :lobby_creator!,
  :lobby_state!,
  :latest_match_state!
);

/* @name createRound */
INSERT INTO rounds (
  lobby_id,
  round_within_match,
  starting_block_height
) VALUES (
  :lobby_id!,
  :round_within_match!,
  :starting_block_height!
);

/* @name createMove */
INSERT INTO match_moves (
  lobby_id,
  wallet,
  round,
  move_rps
) VALUES (
  :lobby_id!,
  :wallet!,
  :round!,
  :move_rps!
);

/* @name createUserStats */
INSERT INTO global_user_state (wallet)
VALUES (:wallet!)
ON CONFLICT (wallet) DO NOTHING;

/* @name createFinalMatchState */
INSERT INTO final_match_state (
  lobby_id,
  player_one_wallet,
  player_one_result,
  player_two_wallet,
  player_two_result,
  total_time,
  game_moves
) VALUES (
  :lobby_id!,
  :player_one_wallet!,
  :player_one_result!,
  :player_two_wallet!,
  :player_two_result!,
  :total_time!,
  :game_moves!
);
