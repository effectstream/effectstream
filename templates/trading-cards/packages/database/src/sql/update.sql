/* @name updateLobbyState */
UPDATE lobbies
SET lobby_state = :lobby_state!
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyCurrentMatch */
UPDATE lobbies
SET current_match = :current_match
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyCurrentRound */
UPDATE lobbies
SET current_round = :current_round
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyMatchState */
UPDATE lobbies
SET
  current_turn = :current_turn!,
  current_proper_round = :current_proper_round!
WHERE lobby_id = :lobby_id!;

/* @name updateLobbyPlayer */
UPDATE lobby_player
SET
  hit_points = :hit_points!,
  current_deck = :current_deck!,
  current_hand = :current_hand!,
  current_board = :current_board!,
  current_draw = :current_draw!,
  current_result = :current_result,
  turn = :turn
WHERE
  lobby_id = :lobby_id! AND nft_id = :nft_id!;

/* @name executedRound */
UPDATE match_round
SET execution_block_height = :execution_block_height!
WHERE
  lobby_id = :lobby_id! AND
  match_within_lobby = :match_within_lobby! AND
  round_within_match = :round_within_match!;

/* @name addWin */
UPDATE global_user_state
SET wins = wins + 1
WHERE nft_id = :nft_id;

/* @name addLoss */
UPDATE global_user_state
SET losses = losses + 1
WHERE nft_id = :nft_id;

/* @name addTie */
UPDATE global_user_state
SET ties = ties + 1
WHERE nft_id = :nft_id;

/* @name transferCard */
UPDATE cards
SET owner_nft_id = :owner_nft_id
WHERE id = :id!;

/* @name setTradeNftCards */
UPDATE card_trade_nft
SET cards = :cards
WHERE nft_id = :nft_id!;

/* @name deleteTradeNftCards */
UPDATE card_trade_nft
SET cards = NULL
WHERE nft_id = :nft_id!;
