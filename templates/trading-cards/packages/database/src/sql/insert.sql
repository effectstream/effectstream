/*
  @name createLobby
*/
INSERT INTO lobbies(
  lobby_id,
  max_players,
  num_of_rounds,
  turn_length,
  creation_block_height,
  created_at,
  hidden,
  practice,
  lobby_creator,
  lobby_state
)
VALUES(
  :lobby_id!,
  :max_players!,
  :num_of_rounds!,
  :turn_length!,
  :creation_block_height!,
  :created_at!,
  :hidden!,
  :practice!,
  :lobby_creator!,
  :lobby_state!
);

/*
  @name joinPlayerToLobby
*/
INSERT INTO lobby_player(
  lobby_id,
  nft_id,
  starting_commitments,
  hit_points,
  current_deck,
  turn
)
VALUES(
  :lobby_id!,
  :nft_id!,
  :starting_commitments!,
  :hit_points!,
  :current_deck!,
  :turn
);

/* @name newMatch */
INSERT INTO lobby_match(
  lobby_id,
  match_within_lobby,
  starting_block_height
)
VALUES (
  :lobby_id!,
  :match_within_lobby!,
  :starting_block_height!
)
RETURNING *;

/*
  @name newRound
*/
INSERT INTO match_round(
  lobby_id,
  match_within_lobby,
  round_within_match,
  starting_block_height,
  execution_block_height
)
VALUES (
  :lobby_id!,
  :match_within_lobby!,
  :round_within_match!,
  :starting_block_height!,
  :execution_block_height
)
RETURNING *;

/*
  @name newMove
*/
INSERT INTO round_move(
  lobby_id,
  match_within_lobby,
  round_within_match,
  move_within_round,
  nft_id,
  serialized_move
)
VALUES (
  :lobby_id!,
  :match_within_lobby!,
  :round_within_match!,
  :move_within_round!,
  :nft_id!,
  :serialized_move!
);

/* @name newStats
  @param stats -> (nft_id!, wins!, losses!, ties!)
*/
INSERT INTO global_user_state
VALUES :stats
ON CONFLICT (nft_id)
DO NOTHING;

/* @name insertNftOwnership */
INSERT INTO nft_ownership (nft_id, wallet_address)
VALUES (:nft_id!, :wallet_address!)
ON CONFLICT (nft_id)
DO UPDATE SET
  wallet_address = EXCLUDED.wallet_address;

/* @name newTradeNft */
INSERT INTO card_trade_nft (nft_id)
VALUES (:nft_id!)
ON CONFLICT (nft_id)
DO NOTHING;

/* @name newCardPack
  @param pack -> (buyer_nft_id!, card_registry_ids!)
*/
INSERT INTO card_packs (buyer_nft_id, card_registry_ids)
VALUES :pack
RETURNING *;

/* @name newCard */
INSERT INTO cards (owner_nft_id, registry_id)
VALUES (:owner_nft_id!, :registry_id!)
RETURNING *;
