/* 
  @name createLobby 
*/
INSERT INTO lobbies(
   lobby_id,
   num_of_rounds,
   round_length,
   play_time_per_player,
   current_round,
   creation_block_height,
   created_at,
   hidden,
   practice,
   bot_difficulty,
   lobby_creator,
   player_one_iswhite,
   lobby_state,
   player_two,
   latest_match_state)
VALUES(
 :lobby_id!,
 :num_of_rounds!,
 :round_length!,
 :play_time_per_player!,
 :current_round,
 :creation_block_height!,
 :created_at!,
 :hidden!,
 :practice!,
 :bot_difficulty!,
 :lobby_creator!,
 :player_one_iswhite!,
 :lobby_state!,
 :player_two,
 :latest_match_state!
);

/* 
  @name newRound
*/
INSERT INTO rounds(
  lobby_id, 
  round_within_match, 
  match_state, 
  player_one_blocks_left, 
  player_two_blocks_left, 
  starting_block_height, 
  execution_block_height)
VALUES (
  :lobby_id!, 
  :round_within_match!, 
  :match_state!, 
  :player_one_blocks_left!, 
  :player_two_blocks_left!, 
  :starting_block_height!, 
  :execution_block_height)
RETURNING *;

/* 
  @name newMatchMove
  @param new_move -> (lobby_id!, wallet!, round!, move_pgn)
*/
INSERT INTO match_moves(lobby_id, wallet, round, move_pgn)
VALUES :new_move;

/* @name newFinalState
  @param final_state -> (lobby_id!, player_one_iswhite!, player_one_wallet!, player_one_result!, player_one_elapsed_time!, player_two_wallet!, player_two_result!, player_two_elapsed_time!, positions!)
*/
INSERT INTO final_match_state(lobby_id, player_one_iswhite, player_one_wallet, player_one_result, player_one_elapsed_time, player_two_wallet, player_two_result, player_two_elapsed_time, positions)
VALUES :final_state;

/* @name newStats
  @param stats -> (wallet!, wins!, losses!, ties!, rating!)
*/
INSERT INTO global_user_state
VALUES :stats
ON CONFLICT (wallet)
DO NOTHING;

/* 
  @name updateStats
  @param stats -> (wallet!, wins!, losses!, ties!, rating!)
*/
INSERT INTO global_user_state
VALUES :stats
ON CONFLICT (wallet)
DO UPDATE SET
wins = EXCLUDED.wins,
losses = EXCLUDED.losses,
ties = EXCLUDED.ties,
rating = EXCLUDED.rating;
