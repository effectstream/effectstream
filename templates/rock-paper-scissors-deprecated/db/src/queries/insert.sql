/* 
  @name createLobby 
*/
INSERT INTO lobbies (
   lobby_id,
   num_of_rounds,
   round_length,
   current_round,
   creation_block_height,
   created_at,
   hidden,
   practice,
   lobby_creator,
   lobby_state,
   player_two,
   latest_match_state,
   round_winner
)
VALUES (
 :lobby_id!,
 :num_of_rounds,
 :round_length,
 :current_round,
 :creation_block_height!,
 :created_at!,
 :hidden!,
 :practice!,
 :lobby_creator!,
 :lobby_state!,
 :player_two,
 :latest_match_state!,
 :round_winner!
);

/* 
  @name newRound
*/
INSERT INTO rounds(lobby_id, round_within_match, starting_block_height, execution_block_height)
VALUES (:lobby_id!, :round_within_match!, :starting_block_height!, :execution_block_height)
RETURNING *;

/* 
  @name newMatchMove
*/
INSERT INTO match_moves(lobby_id, wallet, round, move_rps)
VALUES (:lobby_id!, :wallet!, :round!, :move_rps!);

/* 
  @name newFinalState
*/
INSERT INTO final_match_state (
  lobby_id, 
  player_one_wallet, 
  player_one_result, 
  player_two_wallet, 
  player_two_result, 
  total_time, 
  game_moves
)
VALUES (
  :lobby_id!,
  :player_one_wallet!,
  :player_one_result!,
  :player_two_wallet!,
  :player_two_result!,
  :total_time!,
  :game_moves!
);

/* 
  @name newStats
*/
INSERT INTO global_user_state
VALUES (:wallet!, :wins!, :losses!, :ties!)
ON CONFLICT (wallet)
DO NOTHING;

/* 
  @name updateStats
*/
INSERT INTO global_user_state
VALUES (:wallet!, :wins!, :losses!, :ties!)
ON CONFLICT (wallet)
DO UPDATE SET
wins = EXCLUDED.wins,
losses = EXCLUDED.losses,
ties = EXCLUDED.ties;